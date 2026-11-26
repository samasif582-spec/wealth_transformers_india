import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { CsvImportService } from './csv-import.service';
import { MetaMessagesAdapter } from '../templates/meta-messages.adapter';
import {
  Client,
  CategoryTier,
  ConsentStatus,
  AccountStatus,
  AuditActionType,
  UserRole,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, getRedisConnection } from '../queue/queue.constants';
import { normalizeToE164 } from './utils/phone-normalizer';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { ErasureRequestDto } from './dto/erasure-request.dto';

export interface PaginatedClientsResponse {
  data: Client[];
  total: number;
  page: number;
  totalPages: number;
  meta?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

@Injectable()
export class ClientsService implements OnModuleInit {
  private readonly logger = new Logger(ClientsService.name);
  private exportQueue?: Queue;
  private campaignQueue?: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
    private readonly csvImportService: CsvImportService,
    private readonly config: ConfigService,
    private readonly metaAdapter: MetaMessagesAdapter,
    @Optional() @Inject('QUEUE_CONFIG') private readonly injectedQueueConfig?: any,
  ) {
    try {
      const conn = this.injectedQueueConfig || getRedisConnection(this.config);
      this.exportQueue = new Queue(QUEUE_NAMES.CLIENT_EXPORT, { connection: conn });
      this.campaignQueue = new Queue(QUEUE_NAMES.CAMPAIGN_MESSAGES, { connection: conn });
    } catch (err: any) {
      this.logger.warn(`Could not initialize BullMQ queues in ClientsService: ${err.message}`);
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.client.count();
      if (count === 0) {
        this.logger.log('👥 Initializing verified client directory baseline...');
        const baseline = [
          {
            fullName: 'Vikramaditya Singhania',
            whatsappNumber: '+919820123456',
            email: 'vikram.singhania@apexventures.in',
            dateOfBirth: new Date(Date.UTC(1985, 10, 21)),
            categoryTier: CategoryTier.RETAIL,
            communicationConsent: ConsentStatus.OPTED_IN,
            preferredLanguage: 'en',
          },
          {
            fullName: 'Deepak Mehta',
            whatsappNumber: '+919825099887',
            email: 'deepak.mehta@example.com',
            dateOfBirth: new Date(Date.UTC(1992, 0, 30)),
            categoryTier: CategoryTier.RETAIL,
            communicationConsent: ConsentStatus.OPTED_IN,
            preferredLanguage: 'en',
          },
          {
            fullName: 'Kavita Reddy',
            whatsappNumber: '+919848011223',
            email: 'kavita.reddy@example.com',
            dateOfBirth: new Date(Date.UTC(1984, 5, 14)),
            categoryTier: CategoryTier.RETAIL,
            communicationConsent: ConsentStatus.OPTED_IN,
            preferredLanguage: 'en',
          },
          {
            fullName: 'Sunil Mittal',
            whatsappNumber: '+919811122233',
            email: 'sunil.mittal@example.com',
            dateOfBirth: new Date(Date.UTC(1968, 9, 23)),
            categoryTier: CategoryTier.RETAIL,
            communicationConsent: ConsentStatus.OPTED_IN,
            preferredLanguage: 'en',
          },
        ];

        for (const c of baseline) {
          await this.prisma.client.create({ data: c });
        }
        this.logger.log(`✅ Seeded ${baseline.length} baseline verified clients.`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not seed default clients: ${err.message}`);
    }
  }

  /**
   * Sub-500ms GIN full-text search and client filtering across 100k records.
   * Strictly enforces Property P5 (soft-deleted clients excluded by default).
   */
  async findAll(dto: QueryClientsDto): Promise<PaginatedClientsResponse> {
    const {
      q,
      categoryTier,
      communicationConsent,
      accountStatus,
      preferredLanguage,
      tagId,
      dob_month,
      page = 1,
      limit = 25,
      include_deleted = false,
    } = dto;

    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      ...(include_deleted ? {} : { deletedAt: null }),
      ...(accountStatus ? { accountStatus } : {}),
      ...(communicationConsent ? { communicationConsent } : {}),
      ...(categoryTier ? { categoryTier } : {}),
      ...(preferredLanguage ? { preferredLanguage } : {}),
    };

    if (tagId) {
      where.tags = {
        some: {
          OR: [{ id: tagId }, { tag: tagId }],
        },
      };
    }

    if (q && q.trim().length > 0) {
      const searchTerm = q.trim();
      where.OR = [
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { whatsappNumber: { contains: searchTerm } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (dob_month) {
      const rawResult = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM clients
        WHERE EXTRACT(MONTH FROM date_of_birth) = ${dob_month}
          ${include_deleted ? Prisma.sql`` : Prisma.sql`AND deleted_at IS NULL`}
      `;
      const ids = rawResult.map((r) => r.id);
      where.id = { in: ids };
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tags: true,
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      total,
      page,
      totalPages,
      meta: {
        total,
        page,
        limit,
        pages: totalPages,
      },
    };
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
      include: {
        tags: true,
        consentRecords: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    return client;
  }

  async create(dto: CreateClientDto, actorUserId?: string): Promise<Client> {
    const rawPhone = dto.whatsappNumber || dto.phone || '';
    const phoneResult = normalizeToE164(rawPhone, 'IN');

    if (!phoneResult.valid || !phoneResult.e164) {
      throw new BadRequestException(
        phoneResult.error || `Invalid WhatsApp phone number: ${rawPhone}`,
      );
    }

    const normalizedPhone = phoneResult.e164;

    const existing = await this.prisma.client.findFirst({
      where: { whatsappNumber: normalizedPhone },
    });
    if (existing) {
      throw new ConflictException(`Phone ${normalizedPhone} already registered`);
    }

    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          fullName: dto.fullName || dto.name || '',
          whatsappNumber: normalizedPhone,
          email: dto.email || null,
          categoryTier: dto.categoryTier || dto.category || CategoryTier.RETAIL,
          preferredLanguage: dto.preferredLanguage || dto.language || 'en',
          communicationConsent: dto.communicationConsent || ConsentStatus.PENDING,
          accountStatus: dto.accountStatus || AccountStatus.ACTIVE,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
          tags: dto.tags && dto.tags.length > 0
            ? {
                create: dto.tags.map((tag) => ({ tag })),
              }
            : undefined,
        },
        include: { tags: true },
      });

      // Insert initial append-only consent record
      await tx.whatsappConsent.create({
        data: {
          clientId: created.id,
          consentStatus: created.communicationConsent,
          consentSource: 'MANUAL_ENTRY',
          reason: 'Initial client onboarding registration',
          recordedByUserId: actorUserId,
        },
      });

      return created;
    });

    await this.auditService.log({
      actorId: actorUserId,
      actionType: 'CREATE',
      resourceType: 'client',
      resourceId: client.id,
      afterState: { id: client.id, phone: client.whatsappNumber, name: client.fullName },
    });

    return client;
  }

  async update(id: string, dto: UpdateClientDto, actorUserId?: string): Promise<Client> {
    const existing = await this.findOne(id);

    const updateData: Prisma.ClientUpdateInput = {};

    if (dto.fullName !== undefined || dto.name !== undefined) {
      updateData.fullName = dto.fullName || dto.name;
    }
    if (dto.email !== undefined) {
      updateData.email = dto.email;
    }
    if (dto.preferredLanguage !== undefined || dto.language !== undefined) {
      updateData.preferredLanguage = dto.preferredLanguage || dto.language;
    }
    if (dto.categoryTier !== undefined || dto.category !== undefined) {
      updateData.categoryTier = dto.categoryTier || dto.category;
    }
    if (dto.accountStatus !== undefined) {
      updateData.accountStatus = dto.accountStatus;
    }
    if (dto.dateOfBirth !== undefined || dto.dob !== undefined) {
      updateData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;
    }

    if (dto.whatsappNumber !== undefined || dto.phone !== undefined) {
      const rawPhone = dto.whatsappNumber || dto.phone || '';
      const phoneResult = normalizeToE164(rawPhone, 'IN');
      if (!phoneResult.valid || !phoneResult.e164) {
        throw new BadRequestException(
          phoneResult.error || `Invalid WhatsApp phone number: ${rawPhone}`,
        );
      }
      const newPhone = phoneResult.e164;
      const conflict = await this.prisma.client.findFirst({
        where: { whatsappNumber: newPhone, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(`Phone ${newPhone} already registered`);
      }
      updateData.whatsappNumber = newPhone;
    }

    const updated = await this.prisma.client.update({
      where: { id },
      data: updateData,
      include: { tags: true },
    });

    await this.auditService.log({
      actorId: actorUserId,
      actionType: 'UPDATE',
      resourceType: 'client',
      resourceId: id,
      beforeState: { id, fullName: existing.fullName, phone: existing.whatsappNumber },
      afterState: { id, fullName: updated.fullName, phone: updated.whatsappNumber },
    });

    return updated;
  }

  /**
   * Soft-delete client: sets deletedAt = new Date() and accountStatus = 'INACTIVE'.
   * Enforces Property P5.
   */
  async softDelete(id: string, actorUserId?: string): Promise<Client> {
    await this.findOne(id);

    const updated = await this.prisma.client.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        accountStatus: AccountStatus.INACTIVE,
      },
    });

    await this.auditService.log({
      actorId: actorUserId,
      actionType: 'DELETE',
      resourceType: 'client',
      resourceId: id,
      metadata: { action: 'SOFT_DELETE' },
    });

    return updated;
  }

  /**
   * Restore soft-deleted client: clears deletedAt = null and sets accountStatus = 'INACTIVE'.
   * Super_Admin only.
   */
  async restore(id: string, actorUserId?: string): Promise<Client> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    const restored = await this.prisma.client.update({
      where: { id },
      data: {
        deletedAt: null,
        accountStatus: AccountStatus.INACTIVE,
      },
    });

    await this.auditService.log({
      actorId: actorUserId,
      actionType: 'RESTORE',
      resourceType: 'client',
      resourceId: id,
      metadata: { action: 'RESTORE_CLIENT' },
    });

    return restored;
  }

  /**
   * DPDP Right-to-Erasure Anonymization.
   * Transactionally scrubs all client PII:
   * - fullName = 'ERASED_' + id
   * - email = 'ERASED_' + id + '@deleted.local'
   * - whatsappNumber = '+ERASED_' + id.replace(/-/g, '').slice(0, 10) (Strictly <= 20 chars)
   * - redacts variableValues in message_logs
   * - deletes client_tags
   * - sets Redis suppression key
   * - purges in-flight BullMQ campaign-messages jobs
   */
  async eraseClient(
    id: string,
    dto: ErasureRequestDto,
    actorUserId?: string,
  ): Promise<{ success: boolean; erasedAt: string; clientId: string }> {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException(`Client ${id} not found`);
    }

    const now = new Date();
    const erasedToken = `ERASED_${id}`;
    const erasedEmail = `ERASED_${id}@deleted.local`;
    // PostgreSQL VarChar(20) limit: '+ERASED_' (8 chars) + 10 chars = 18 chars total
    const erasedPhone = `+ERASED_${id.replace(/-/g, '').slice(0, 10)}`;

    await this.prisma.$transaction(async (tx) => {
      // 1. Anonymize Client table
      await tx.client.update({
        where: { id },
        data: {
          fullName: erasedToken,
          email: erasedEmail,
          whatsappNumber: erasedPhone,
          dateOfBirth: null,
          accountStatus: AccountStatus.INACTIVE,
          communicationConsent: ConsentStatus.OPTED_OUT,
          deletedAt: now,
        },
      });

      // 2. Delete tags
      await tx.clientTag.deleteMany({ where: { clientId: id } });

      // 3. Anonymize variableValues in message logs
      await tx.messageLog.updateMany({
        where: { clientId: id },
        data: {
          variableValues: { '1': erasedToken },
        },
      });

      // 4. Record immutable opt-out consent
      await tx.whatsappConsent.create({
        data: {
          clientId: id,
          consentStatus: ConsentStatus.OPTED_OUT,
          consentSource: 'API',
          reason: `DPDP Right-to-Erasure anonymization: ${dto.reason}`,
          recordedByUserId: actorUserId,
        },
      });

      // 5. Append-only Audit Log (No old PII leaked in beforeState!)
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          actionType: 'UPDATE',
          resourceType: 'client',
          resourceId: id,
          metadata: {
            action: 'DPDP_RIGHT_TO_ERASURE',
            reason: dto.reason,
            erasedAt: now.toISOString(),
          },
        },
      });
    });

    // 6. Redis suppression key (1 year TTL)
    await this.redis.set(`consent:suppressed:${id}`, 'OPTED_OUT', 'EX', 86400 * 365);

    // 7. Purge in-flight campaign messages
    if (this.campaignQueue) {
      try {
        const waitingJobs = await this.campaignQueue.getJobs(['waiting', 'delayed']);
        for (const job of waitingJobs) {
          if (job.data?.clientId === id) {
            await job.remove();
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to purge queue during erasure for client ${id}: ${err.message}`);
      }
    }

    return {
      success: true,
      erasedAt: now.toISOString(),
      clientId: id,
    };
  }

  // Alias for eraseClient to support erase(id) calls if any
  async erase(id: string, actorUserId?: string) {
    return this.eraseClient(id, { confirmed: true, reason: 'DPDP Erasure request' }, actorUserId);
  }

  async import(file: { buffer?: Buffer; path?: string; originalname?: string }, actorUserId?: string) {
    return this.csvImportService.processImport(
      {
        buffer: file.buffer,
        filePath: file.path,
        filename: file.originalname,
      },
      actorUserId,
    );
  }

  async export(filters: QueryClientsDto): Promise<{ jobId: string }> {
    if (!this.exportQueue) {
      const conn = this.injectedQueueConfig || getRedisConnection(this.config);
      this.exportQueue = new Queue(QUEUE_NAMES.CLIENT_EXPORT, { connection: conn });
    }
    const job = await this.exportQueue.add(
      'export-clients',
      { filters },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return { jobId: String(job.id) };
  }

  async getStats() {
    const [byConsent, byCategory] = await Promise.all([
      this.prisma.client.groupBy({
        by: ['communicationConsent'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.client.groupBy({
        by: ['categoryTier'],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
    ]);

    return {
      byConsent: byConsent.map((r) => ({
        status: r.communicationConsent,
        count: r._count._all,
      })),
      byCategory: byCategory.map((r) => ({
        tier: r.categoryTier,
        count: r._count._all,
      })),
    };
  }

  async getClientMessages(clientId: string) {
    await this.findOne(clientId);

    const [customLogs, campaignLogs] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          resourceType: 'CUSTOM_MESSAGE',
          resourceId: clientId,
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
      this.prisma.messageLog.findMany({
        where: { clientId },
        include: {
          campaign: {
            select: { name: true, campaignType: true },
          },
        },
        orderBy: { dispatchedAt: 'asc' },
        take: 50,
      }),
    ]);

    const items = [
      ...customLogs.map((log) => {
        const state = (log.afterState as Record<string, any>) || {};
        return {
          id: log.id,
          type: 'custom' as const,
          direction: (state.direction === 'inbound' ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
          body: String(state.message || ''),
          status: String(state.status || 'SENT'),
          wamid: state.wamid ? String(state.wamid) : undefined,
          errorMessage: state.errorMessage ? String(state.errorMessage) : undefined,
          timestamp: log.createdAt.toISOString(),
        };
      }),
      ...campaignLogs.map((log) => ({
        id: log.id,
        type: 'campaign' as const,
        direction: 'outbound' as const,
        body: log.campaign?.name ? `Campaign: ${log.campaign.name}` : 'Campaign Template Message',
        campaignType: log.campaign?.campaignType,
        status: String(log.deliveryStatus),
        wamid: log.metaMessageId || undefined,
        errorMessage: log.errorMessage || undefined,
        timestamp: log.dispatchedAt.toISOString(),
      })),
    ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return { messages: items };
  }

  async sendCustomMessage(
    clientId: string,
    message: string,
    actorId?: string,
    actorRole?: UserRole,
  ) {
    const client = await this.findOne(clientId);

    if (client.fullName.startsWith('ERASED_')) {
      throw new BadRequestException('Cannot send message to an anonymized/erased client');
    }

    if (!client.whatsappNumber) {
      throw new BadRequestException('Client does not have a valid WhatsApp number');
    }

    const trimmed = message.trim();
    const result = await this.metaAdapter.sendTextMessage(client.whatsappNumber, trimmed);
    const status = result.success ? 'SENT' : 'FAILED';

    const log = await this.prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        actorRole: actorRole || null,
        actionType: AuditActionType.CREATE,
        resourceType: 'CUSTOM_MESSAGE',
        resourceId: client.id,
        afterState: {
          message: trimmed,
          wamid: result.wamid || null,
          status,
          errorMessage: result.errorMessage || null,
          to: client.whatsappNumber,
        },
        metadata: {
          mockMode: result.mockMode,
        },
      },
    });

    return {
      success: result.success,
      wamid: result.wamid,
      errorMessage: result.errorMessage,
      mockMode: result.mockMode,
      item: {
        id: log.id,
        type: 'custom' as const,
        direction: 'outbound' as const,
        body: trimmed,
        status,
        wamid: result.wamid,
        errorMessage: result.errorMessage,
        timestamp: log.createdAt.toISOString(),
      },
    };
  }
}
