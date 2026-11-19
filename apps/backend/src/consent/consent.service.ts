import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import {
  ConsentSource,
  ConsentStatus,
  WhatsappConsent,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, getRedisConnection } from '../queue/queue.constants';
import { RecordConsentDto } from './dto/record-consent.dto';
import { InboundOptOutDto } from './dto/inbound-optout.dto';

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);
  private campaignQueue?: Queue;
  private dlqQueue?: Queue;
  private exportQueue?: Queue;

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
      this.dlqQueue = new Queue(QUEUE_NAMES.CONSENT_DLQ, { connection: conn });
      this.exportQueue = new Queue(QUEUE_NAMES.CLIENT_EXPORT, { connection: conn });
    } catch (err: any) {
      this.logger.warn(`Could not initialize BullMQ queues in ConsentService: ${err.message}`);
    }
  }

  /**
   * Records manual consent transition in the immutable append-only register.
   * Atomically synchronizes clients.communication_consent in the same transaction.
   * Sets or clears Redis suppression flag.
   */
  async recordManualConsent(
    dto: RecordConsentDto,
    operatorUserId?: string,
  ): Promise<WhatsappConsent> {
    const { clientId, status, reason, evidenceReference, source } = dto;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new BadRequestException('Mandatory reason is required (1-500 characters)');
    }
    if (reason.length > 500) {
      throw new BadRequestException('Reason exceeds maximum length of 500 characters');
    }
    if (evidenceReference && evidenceReference.length > 2048) {
      throw new BadRequestException(
        'Evidence reference exceeds maximum length of 2048 characters',
      );
    }

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    const consentRecord = await this.prisma.$transaction(async (tx) => {
      // 1. Append immutable consent entry (NO UPDATE OR DELETE)
      const createdConsent = await tx.whatsappConsent.create({
        data: {
          clientId,
          consentStatus: status,
          consentSource: source || ConsentSource.MANUAL_ENTRY,
          reason: reason.trim(),
          evidenceReference: evidenceReference?.trim() || null,
          recordedByUserId: operatorUserId || null,
        },
      });

      // 2. Atomic sync to client table
      await tx.client.update({
        where: { id: clientId },
        data: { communicationConsent: status },
      });

      // 3. If OPTED_OUT, mark in-flight campaign recipients suppressed
      if (status === ConsentStatus.OPTED_OUT) {
        await tx.campaignRecipient.updateMany({
          where: { clientId, consentVerified: true },
          data: { suppressed: true, consentVerified: false },
        });
      }

      return createdConsent;
    });

    // 4. Redis suppression management
    if (status === ConsentStatus.OPTED_OUT) {
      await this.redis.set(`consent:suppressed:${clientId}`, 'OPTED_OUT', 'EX', 86400 * 365);
      await this.purgeCampaignQueueForClient(clientId);
    } else if (status === ConsentStatus.OPTED_IN) {
      await this.redis.del(`consent:suppressed:${clientId}`);
    }

    // 5. Append-only Audit Log
    await this.auditService.log({
      actorId: operatorUserId,
      actionType: 'UPDATE',
      resourceType: 'consent',
      resourceId: consentRecord.id,
      metadata: {
        action: 'MANUAL_CONSENT_CHANGE',
        clientId,
        status,
        reason,
        source: source || 'MANUAL_ENTRY',
      },
    });

    return consentRecord;
  }

  /**
   * Inbound keyword auto opt-out handling:
   * 1. Immediate Redis suppression flag (<1ms).
   * 2. Transactional consent append, client sync, recipient suppression.
   * 3. Purge in-flight BullMQ campaign-messages queue jobs.
   * 4. Fallback to BullMQ consent-dlq on DB failure (Req 4.10).
   */
  async handleInboundOptOut(dto: InboundOptOutDto): Promise<{ success: boolean; clientId?: string }> {
    const { keyword, messageText } = dto;
    let clientId = dto.clientId;

    if (!clientId && dto.whatsappNumber) {
      const client = await this.prisma.client.findFirst({
        where: { whatsappNumber: dto.whatsappNumber },
      });
      if (client) {
        clientId = client.id;
      }
    }

    if (!clientId) {
      this.logger.warn(
        `Inbound opt-out received for unrecognized target: clientId=${dto.clientId}, phone=${dto.whatsappNumber}`,
      );
      return { success: false };
    }

    // 1. Immediate Redis suppression flag (<1ms SLA) - 365-day retention
    await this.redis.set(`consent:suppressed:${clientId}`, 'OPTED_OUT', 'EX', 86400 * 365);

    try {
      // 2. Transactionally append consent record and update client cache
      await this.prisma.$transaction(async (tx) => {
        await tx.whatsappConsent.create({
          data: {
            clientId,
            consentStatus: ConsentStatus.OPTED_OUT,
            consentSource: ConsentSource.WHATSAPP_REPLY,
            reason: `Inbound keyword trigger: ${keyword}${messageText ? ` ("${messageText}")` : ''}`,
          },
        });

        await tx.client.update({
          where: { id: clientId },
          data: { communicationConsent: ConsentStatus.OPTED_OUT },
        });

        await tx.campaignRecipient.updateMany({
          where: { clientId, consentVerified: true },
          data: { suppressed: true, consentVerified: false },
        });
      });

      // 3. Purge in-flight queue jobs
      await this.purgeCampaignQueueForClient(clientId);

      this.logger.log(`Inbound opt-out completed for client ${clientId} with keyword "${keyword}"`);
      return { success: true, clientId };
    } catch (dbError: any) {
      this.logger.error(
        `Database failure during inbound opt-out for client ${clientId}: ${dbError.message}. Enqueuing to consent-dlq`,
      );

      // 4. Fallback to BullMQ consent-dlq on DB failure (Req 4.10)
      if (this.dlqQueue) {
        try {
          await this.dlqQueue.add(
            'failed-opt-out',
            {
              clientId,
              keyword,
              messageText,
              attemptedAt: new Date().toISOString(),
              error: dbError.message,
            },
            {
              attempts: 10,
              backoff: { type: 'exponential', delay: 10000 },
              removeOnComplete: false,
            },
          );
        } catch (queueErr: any) {
          this.logger.error(`Failed to enqueue to consent-dlq: ${queueErr.message}`);
        }
      }

      // Return success false or throw, but note that Redis suppression is still active!
      throw dbError;
    }
  }

  /**
   * Helper for opt-in endpoint
   */
  async optIn(
    clientId: string,
    reason: string,
    source: ConsentSource = ConsentSource.MANUAL_ENTRY,
    metadata?: Record<string, unknown>,
    operatorUserId?: string,
  ): Promise<WhatsappConsent> {
    const evidence = metadata ? JSON.stringify(metadata) : undefined;
    return this.recordManualConsent(
      {
        clientId,
        status: ConsentStatus.OPTED_IN,
        reason,
        evidenceReference: evidence,
        source,
      },
      operatorUserId,
    );
  }

  /**
   * Helper for opt-out endpoint
   */
  async optOut(
    clientId: string,
    reason: string,
    source: ConsentSource = ConsentSource.MANUAL_ENTRY,
    operatorUserId?: string,
  ): Promise<WhatsappConsent> {
    return this.recordManualConsent(
      {
        clientId,
        status: ConsentStatus.OPTED_OUT,
        reason,
        source,
      },
      operatorUserId,
    );
  }

  /**
   * Retrieves entire immutable consent history for a client, ordered by recordedAt DESC.
   */
  async getConsentHistory(clientId: string): Promise<WhatsappConsent[]> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    return this.prisma.whatsappConsent.findMany({
      where: { clientId },
      orderBy: { recordedAt: 'desc' },
      include: {
        recordedBy: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
          },
        },
      },
    });
  }

  async exportRegister(filters?: Record<string, unknown>): Promise<{ jobId: string }> {
    if (!this.exportQueue) {
      const conn = this.injectedQueueConfig || getRedisConnection(this.config);
      this.exportQueue = new Queue(QUEUE_NAMES.CLIENT_EXPORT, { connection: conn });
    }
    const job = await this.exportQueue.add(
      'export-consent-register',
      { filters, type: 'consent-register' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    return { jobId: String(job.id) };
  }

  private async purgeCampaignQueueForClient(clientId: string): Promise<void> {
    if (!this.campaignQueue) return;
    try {
      const waitingJobs = await this.campaignQueue.getJobs(['waiting', 'delayed']);
      for (const job of waitingJobs) {
        if (job.data?.clientId === clientId) {
          await job.remove();
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not purge campaign queue for ${clientId}: ${err.message}`);
    }
  }
}
