import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import {
  Campaign,
  CampaignStatus,
  CampaignType,
  CategoryTier,
  ConsentStatus,
  DeliveryStatus,
  Prisma,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, getRedisConnection } from '../queue/queue.constants';
import * as crypto from 'crypto';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  private campaignQueue?: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
    @Optional() @Inject('QUEUE_CONFIG') private readonly injectedQueueConfig?: any,
  ) {
    try {
      const conn = this.injectedQueueConfig || getRedisConnection(this.config);
      this.campaignQueue = new Queue(QUEUE_NAMES.CAMPAIGN_MESSAGES, { connection: conn });
    } catch (err: any) {
      this.logger.warn(`Could not initialize campaign BullMQ queue: ${err.message}`);
    }
  }

  /**
   * Builds the Prisma where clause for audience segmentation.
   * STRICTLY enforces Property P1 (consentStatus = OPTED_IN) and Property P5 (deleted_at IS NULL).
   */
  private buildAudienceFilter(audienceFilters?: any): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {
      communicationConsent: ConsentStatus.OPTED_IN,
      deletedAt: null,
      accountStatus: 'ACTIVE',
    };

    if (audienceFilters) {
      if (audienceFilters.category && audienceFilters.category.length > 0) {
        where.categoryTier = { in: audienceFilters.category };
      }
      if (audienceFilters.language && audienceFilters.language.length > 0) {
        where.preferredLanguage = { in: audienceFilters.language };
      }
    }

    return where;
  }

  /**
   * Creates a new campaign with immediate audience resolution (<3s).
   * Calculates statutory pricing with 18% GST (Property P8).
   */
  async create(dto: CreateCampaignDto, actorId: string): Promise<Campaign> {
    const template = await this.prisma.messageTemplate.findUnique({
      where: { id: dto.template_id },
    });

    if (!template) {
      throw new NotFoundException(`Message template ${dto.template_id} not found`);
    }

    // Resolve initial audience count strictly checking OPTED_IN (Property P1)
    const audienceWhere = this.buildAudienceFilter(dto.audience_filters);
    const resolvedRecipientCount = await this.prisma.client.count({ where: audienceWhere });

    // Determine initial status: Promotional & Festival requires approval
    const requiresApproval =
      dto.type === CampaignType.PROMOTIONAL || dto.type === CampaignType.FESTIVAL;
    let initialStatus: CampaignStatus = CampaignStatus.DRAFT;

    if (requiresApproval) {
      initialStatus = CampaignStatus.PENDING_APPROVAL;
    } else if (dto.scheduled_at) {
      initialStatus = CampaignStatus.SCHEDULED;
    }

    // Pricing calculation with 18% GST (Property P8)
    const isMarketing = template.category === 'MARKETING';
    const baseRate = isMarketing ? 0.7854 : 0.1258;
    const estimatedCostInr = new Prisma.Decimal(
      (resolvedRecipientCount * baseRate * 1.18).toFixed(4),
    );

    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name,
        campaignType: dto.type,
        status: initialStatus,
        templateId: dto.template_id,
        segmentFilter: dto.audience_filters ? (dto.audience_filters as any) : undefined,
        resolvedRecipientCount,
        scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
        estimatedCostInr,
        createdByUserId: actorId,
        stateTransitions: {
          create: {
            fromStatus: CampaignStatus.DRAFT,
            toStatus: initialStatus,
            actorId,
            note: 'Initial campaign creation and audience resolution',
          },
        },
      },
      include: {
        template: true,
      },
    });

    await this.auditService.log({
      actorId,
      actionType: 'CREATE',
      resourceType: 'Campaign',
      resourceId: campaign.id,
      afterState: { id: campaign.id, name: campaign.name, status: campaign.status, count: resolvedRecipientCount },
    });

    return campaign;
  }

  /**
   * Retrieves paginated campaigns with live delivery summaries.
   */
  async findAll(query: {
    page?: number;
    limit?: number;
    status?: CampaignStatus;
    type?: CampaignType;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.campaignType = query.type;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [total, data] = await Promise.all([
      this.prisma.campaign.count({ where }),
      this.prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { id: true, name: true, category: true, qualityRating: true } },
          createdBy: { select: { id: true, fullName: true, email: true } },
          _count: {
            select: {
              recipients: true,
              messageLogs: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Retrieves single campaign with delivery stats.
   */
  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        template: true,
        createdBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        stateTransitions: { orderBy: { transitionedAt: 'desc' } },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    // Aggregate message logs by delivery status
    const deliverySummary = await this.prisma.messageLog.groupBy({
      by: ['deliveryStatus'],
      where: { campaignId: id },
      _count: true,
    });

    const statusCounts: Record<string, number> = {
      QUEUED: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
      UNDELIVERABLE: 0,
    };

    deliverySummary.forEach((s) => {
      statusCounts[s.deliveryStatus] = s._count;
    });

    return {
      ...campaign,
      deliverySummary: statusCounts,
    };
  }

  /**
   * Approves a campaign pending supervisory review.
   */
  async approve(id: string, actorId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);

    if (campaign.status !== CampaignStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Campaign cannot be approved from status ${campaign.status} (must be PENDING_APPROVAL)`,
      );
    }

    const nextStatus = campaign.scheduledAt && campaign.scheduledAt > new Date()
      ? CampaignStatus.SCHEDULED
      : CampaignStatus.APPROVED;

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: nextStatus,
        approvedByUserId: actorId,
        approvedAt: new Date(),
        stateTransitions: {
          create: {
            fromStatus: CampaignStatus.PENDING_APPROVAL,
            toStatus: nextStatus,
            actorId,
            note: 'Campaign approved by supervisory administrator',
          },
        },
      },
    });

    await this.auditService.log({
      actorId,
      actionType: 'UPDATE',
      resourceType: 'Campaign',
      resourceId: id,
      beforeState: { status: campaign.status },
      afterState: { status: nextStatus },
    });

    // If immediate dispatch, execute now
    if (nextStatus === CampaignStatus.APPROVED) {
      await this.dispatch(id, actorId);
    }

    return updated;
  }

  /**
   * Rejects a campaign with mandatory reason.
   */
  async reject(id: string, reason: string, actorId: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);

    if (campaign.status !== CampaignStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot reject campaign with status ${campaign.status}`);
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.REJECTED,
        rejectedByUserId: actorId,
        rejectionReason: reason,
        stateTransitions: {
          create: {
            fromStatus: CampaignStatus.PENDING_APPROVAL,
            toStatus: CampaignStatus.REJECTED,
            actorId,
            note: `Rejected: ${reason}`,
          },
        },
      },
    });

    await this.auditService.log({
      actorId,
      actionType: 'UPDATE',
      resourceType: 'Campaign',
      resourceId: id,
      beforeState: { status: campaign.status },
      afterState: { status: CampaignStatus.REJECTED, reason },
    });

    return updated;
  }

  /**
   * Dispatches the campaign audience into BullMQ queue.
   * Strictly enforces Property P1 (OPTED_IN only), P2 (SHA256 Idempotency), and P5 (no soft-deleted).
   */
  async dispatch(id: string, actorId?: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { template: true },
    });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);

    // Lock audience snapshot
    const audienceWhere = this.buildAudienceFilter(campaign.segmentFilter);
    const eligibleClients = await this.prisma.client.findMany({
      where: audienceWhere,
      select: { id: true, fullName: true, whatsappNumber: true, preferredLanguage: true },
    });

    const now = new Date();

    // In a transaction, update status to EXECUTING, record recipients & initial message logs
    const updated = await this.prisma.$transaction(async (tx) => {
      const camp = await tx.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.EXECUTING,
          dispatchedAt: now,
          resolvedRecipientCount: eligibleClients.length,
          stateTransitions: {
            create: {
              fromStatus: campaign.status,
              toStatus: CampaignStatus.EXECUTING,
              actorId,
              note: `Dispatched to ${eligibleClients.length} verified opted-in recipients`,
            },
          },
        },
      });

      // Insert recipients snapshot (ignore duplicates)
      for (const client of eligibleClients) {
        await tx.campaignRecipient.upsert({
          where: { campaignId_clientId: { campaignId: id, clientId: client.id } },
          create: {
            campaignId: id,
            clientId: client.id,
            consentVerified: true,
          },
          update: { consentVerified: true },
        });

        // Generate SHA256 Idempotency Key (Property P2)
        const idempotencyKey = crypto
          .createHash('sha256')
          .update(`${id}:${client.id}:${campaign.templateId}`)
          .digest('hex');

        // Initial QUEUED message log
        await tx.messageLog.upsert({
          where: { idempotencyKey },
          create: {
            campaignId: id,
            clientId: client.id,
            templateId: campaign.templateId,
            templateCategory: campaign.template.category,
            idempotencyKey,
            deliveryStatus: DeliveryStatus.QUEUED,
            variableValues: { '1': client.fullName },
            pricingRateInr: campaign.template.category === 'MARKETING' ? 0.7854 : 0.1258,
          },
          update: {},
        });

        // Add to BullMQ queue if queue initialized
        if (this.campaignQueue) {
          await this.campaignQueue.add(
            'send-message',
            {
              campaignId: id,
              clientId: client.id,
              phone: client.whatsappNumber,
              clientName: client.fullName,
              templateId: campaign.templateId,
              idempotencyKey,
            },
            {
              jobId: idempotencyKey, // Prevents duplicate BullMQ enqueueing
              attempts: 5,
              backoff: { type: 'exponential', delay: 30000 },
            },
          );
        }
      }

      return camp;
    });

    this.logger.log(
      `🚀 Campaign ${campaign.name} (${id}) dispatched to ${eligibleClients.length} opted-in clients`,
    );

    return updated;
  }

  /**
   * Pauses an actively executing campaign.
   */
  async pause(id: string, actorId?: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.PAUSED,
        stateTransitions: {
          create: {
            fromStatus: campaign.status,
            toStatus: CampaignStatus.PAUSED,
            actorId,
            note: 'Outbound dispatch paused by operator',
          },
        },
      },
    });

    return updated;
  }

  /**
   * Resumes a paused campaign.
   */
  async resume(id: string, actorId?: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.EXECUTING,
        stateTransitions: {
          create: {
            fromStatus: campaign.status,
            toStatus: CampaignStatus.EXECUTING,
            actorId,
            note: 'Outbound dispatch resumed by operator',
          },
        },
      },
    });

    return updated;
  }

  /**
   * Cancels a campaign.
   */
  async cancel(id: string, reason?: string, actorId?: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException(`Campaign ${id} not found`);

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: actorId,
        stateTransitions: {
          create: {
            fromStatus: campaign.status,
            toStatus: CampaignStatus.CANCELLED,
            actorId,
            note: reason || 'Campaign cancelled by operator',
          },
        },
      },
    });

    return updated;
  }
}
