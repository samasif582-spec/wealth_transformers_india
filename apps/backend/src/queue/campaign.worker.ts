import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { MetaMessagesAdapter, TemplateComponent } from '../templates/meta-messages.adapter';
import { QUEUE_NAMES, getRedisConnection } from './queue.constants';
import {
  CampaignStatus,
  ConsentStatus,
  DeliveryStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';

export interface SendMessageJobPayload {
  campaignId?: string;
  clientId: string;
  phone: string;
  clientName: string;
  templateId: string;
  idempotencyKey: string;
  customVariables?: Record<string, string>;
}

@Injectable()
export class CampaignWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignWorker.name);
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly metaAdapter: MetaMessagesAdapter,
    private readonly auditService: AuditService,
    @Optional() @Inject('QUEUE_CONFIG') private readonly injectedQueueConfig?: any,
  ) {}

  async onModuleInit(): Promise<void> {
    const concurrency = parseInt(
      this.config.get<string>('WORKER_CONCURRENCY') ||
        process.env['WORKER_CONCURRENCY'] ||
        '10',
      10,
    );

    const connection = this.injectedQueueConfig || getRedisConnection(this.config);

    try {
      this.worker = new Worker(
        QUEUE_NAMES.CAMPAIGN_MESSAGES,
        async (job: Job<SendMessageJobPayload>) => {
          return this.processJob(job);
        },
        {
          connection,
          concurrency,
        },
      );

      this.worker.on('completed', (job: Job) => {
        this.logger.debug(
          `Job ${job.id} on queue ${QUEUE_NAMES.CAMPAIGN_MESSAGES} completed successfully`,
        );
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        this.logger.warn(
          `Job ${job?.id} on queue ${QUEUE_NAMES.CAMPAIGN_MESSAGES} failed: ${err.message}`,
        );
      });

      this.worker.on('error', (err: Error) => {
        this.logger.error(`BullMQ Worker encountered an error: ${err.message}`);
      });

      this.logger.log(
        `🚀 CampaignWorker subscribed to '${QUEUE_NAMES.CAMPAIGN_MESSAGES}' | concurrency=${concurrency}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to initialize CampaignWorker: ${err.message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      this.logger.log('Gracefully closing CampaignWorker...');
      await this.worker.close();
      this.logger.log('CampaignWorker shutdown complete');
    }
  }

  /**
   * Core processing method for each outbound message job.
   */
  async processJob(job: Job<SendMessageJobPayload>): Promise<any> {
    const payload = job.data;
    const { campaignId, clientId, phone, templateId, idempotencyKey } = payload;

    this.logger.log(
      `Processing message job ${job.id} for client ${clientId} | Key: ${idempotencyKey}`,
    );

    // Circuit breaker check
    const isPaused = (await this.redis.get('whatsapp:circuit_breaker:paused')) === 'true';
    if (isPaused) {
      this.logger.warn(`⏸️ Emergency circuit breaker active. Holding message job ${job.id}`);
      throw new Error('EMERGENCY_CIRCUIT_BREAKER_ACTIVE: Outbound dispatching is paused by Administrator');
    }

    // 1. Retrieve & validate client record
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || client.deletedAt !== null || client.accountStatus !== 'ACTIVE') {
      this.logger.warn(
        `Client ${clientId} is deleted or inactive. Discarding message job ${job.id}`,
      );
      await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
        errorCode: 'CLIENT_INACTIVE',
        errorMessage: 'Client account is deleted, inactive, or not found',
        failedAt: new Date(),
      });
      return { status: 'DISCARDED', reason: 'CLIENT_INACTIVE' };
    }

    // 2. Re-verify WhatsApp consent immediately before dispatch (Zero-Tolerance Policy)
    if (client.communicationConsent !== ConsentStatus.OPTED_IN) {
      this.logger.warn(
        `Client ${clientId} communication consent is ${client.communicationConsent}. Aborting dispatch.`,
      );
      await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
        errorCode: 'CONSENT_REVOKED',
        errorMessage: `Communication consent is ${client.communicationConsent}`,
        failedAt: new Date(),
      });
      return { status: 'DISCARDED', reason: 'CONSENT_NOT_OPTED_IN' };
    }

    // Re-verify Redis suppression key
    const isSuppressedInRedis =
      (await this.redis.get(`consent:suppressed:${clientId}`)) ||
      (await this.redis.get(`suppression:${phone}`));

    if (isSuppressedInRedis) {
      this.logger.warn(
        `Client ${clientId} phone ${phone} is suppressed in Redis. Aborting dispatch.`,
      );
      await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
        errorCode: 'CONSENT_REVOKED',
        errorMessage: 'Recipient phone is in active Redis suppression list',
        failedAt: new Date(),
      });
      return { status: 'DISCARDED', reason: 'REDIS_SUPPRESSED' };
    }

    // 3. Campaign Status & Regulatory Validation
    let isMarketing = false;
    if (campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        this.logger.warn(`Campaign ${campaignId} not found. Aborting job ${job.id}`);
        await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
          errorCode: 'CAMPAIGN_NOT_FOUND',
          errorMessage: `Campaign ${campaignId} does not exist`,
          failedAt: new Date(),
        });
        return { status: 'DISCARDED', reason: 'CAMPAIGN_NOT_FOUND' };
      }

      if (campaign.status === CampaignStatus.CANCELLED) {
        this.logger.warn(`Campaign ${campaignId} was cancelled. Discarding job ${job.id}`);
        await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
          errorCode: 'CAMPAIGN_CANCELLED',
          errorMessage: 'Campaign was cancelled by operator',
          failedAt: new Date(),
        });
        return { status: 'DISCARDED', reason: 'CAMPAIGN_CANCELLED' };
      }

      if (campaign.status === CampaignStatus.PAUSED) {
        this.logger.warn(`Campaign ${campaignId} is paused. Re-queueing job ${job.id}`);
        throw new Error(`Campaign ${campaignId} is paused; delaying message processing`);
      }

      // Check SEBI / AMFI Regulatory Compliance flag for Marketing campaigns
      const complianceVerified =
        this.config.get<string>('COMPLIANCE_VERIFIED') ||
        process.env['COMPLIANCE_VERIFIED'] ||
        'true';

      if (
        campaign.campaignType === 'PROMOTIONAL' ||
        campaign.campaignType === 'ANNOUNCEMENT'
      ) {
        isMarketing = true;
        if (complianceVerified === 'false') {
          this.logger.error(
            `🚨 Statutory Compliance Gate: Marketing campaign ${campaignId} blocked because COMPLIANCE_VERIFIED is false`,
          );
          await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
            errorCode: 'SEBI_COMPLIANCE_BLOCKED',
            errorMessage:
              'Marketing broadcasts are blocked pending authorized SEBI/AMFI regulatory verification',
            failedAt: new Date(),
          });
          return { status: 'BLOCKED', reason: 'SEBI_COMPLIANCE_GATE' };
        }
      }
    }

    // 4. Retrieve Template & Approved Version
    const template = await this.prisma.messageTemplate.findUnique({
      where: { id: templateId },
      include: {
        versions: {
          where: { status: TemplateStatus.APPROVED },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!template || template.status !== TemplateStatus.APPROVED) {
      this.logger.error(
        `Template ${templateId} is missing or not approved. Aborting job ${job.id}`,
      );
      await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
        errorCode: 'TEMPLATE_NOT_APPROVED',
        errorMessage: `Template ${templateId} is not in APPROVED state`,
        failedAt: new Date(),
      });
      return { status: 'DISCARDED', reason: 'TEMPLATE_NOT_APPROVED' };
    }

    if (template.category === TemplateCategory.MARKETING) {
      isMarketing = true;
    }

    // 5. Build Meta Components Payload
    // By convention in Wealth Transformers templates, {{1}} is client full name
    const recipientName = client.fullName || payload.clientName || 'Valued Client';
    const components: TemplateComponent[] = [
      {
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: recipientName,
          },
        ],
      },
    ];

    // 6. Invoke Meta Messages Adapter
    const targetPhone = client.whatsappNumber || phone;
    const sendResult = await this.metaAdapter.sendMessage({
      to: targetPhone,
      templateName: template.name,
      languageCode: template.language || 'en',
      components,
    });

    // 7. Handle Dispatch Outcome
    if (sendResult.success && sendResult.wamid) {
      await this.prisma.messageLog.updateMany({
        where: { idempotencyKey },
        data: {
          deliveryStatus: DeliveryStatus.SENT,
          metaMessageId: sendResult.wamid,
          sentAt: new Date(),
          retryCount: job.attemptsMade,
          errorCode: null,
          errorMessage: null,
        },
      });

      this.logger.log(
        `✅ Successfully dispatched message to ${targetPhone} | WAMID: ${sendResult.wamid}`,
      );

      // Check if campaign is completed
      if (campaignId) {
        await this.checkAndUpdateCampaignCompletion(campaignId);
      }

      return {
        status: 'SENT',
        wamid: sendResult.wamid,
        mockMode: sendResult.mockMode,
      };
    }

    // Handle Failures
    const category = sendResult.errorCategory || 'PERMANENT';

    if (category === 'PERMANENT') {
      await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
        errorCode: sendResult.errorCode || 'META_API_PERMANENT_ERROR',
        errorMessage: sendResult.errorMessage || 'Meta API rejected message permanently',
        failedAt: new Date(),
        retryCount: job.attemptsMade,
      });

      if (campaignId) {
        await this.checkAndUpdateCampaignCompletion(campaignId);
      }

      return { status: 'FAILED', reason: sendResult.errorCode };
    }

    if (category === 'AMBIGUOUS') {
      await this.updateMessageLogStatus(idempotencyKey, DeliveryStatus.FAILED, {
        errorCode: 'AMBIGUOUS_TIMEOUT',
        errorMessage: 'Meta API HTTP request timed out. Awaiting webhook reconciliation.',
        failedAt: new Date(),
        retryCount: job.attemptsMade,
      });

      return { status: 'FAILED', reason: 'AMBIGUOUS_TIMEOUT' };
    }

    // TRANSIENT: update retry count and throw error for BullMQ backoff
    await this.prisma.messageLog.updateMany({
      where: { idempotencyKey },
      data: {
        retryCount: job.attemptsMade + 1,
        errorCode: sendResult.errorCode || 'TRANSIENT_NETWORK_ERROR',
        errorMessage: sendResult.errorMessage,
      },
    });

    throw new Error(
      `Transient Meta dispatch failure (Attempt ${job.attemptsMade + 1}): ${sendResult.errorMessage}`,
    );
  }

  /**
   * Helper to safely update MessageLog status by idempotency key.
   */
  private async updateMessageLogStatus(
    idempotencyKey: string,
    status: DeliveryStatus,
    extra: {
      errorCode?: string;
      errorMessage?: string;
      failedAt?: Date;
      retryCount?: number;
    } = {},
  ): Promise<void> {
    try {
      await this.prisma.messageLog.updateMany({
        where: { idempotencyKey },
        data: {
          deliveryStatus: status,
          ...extra,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to update MessageLog status for key ${idempotencyKey}: ${err.message}`,
      );
    }
  }

  /**
   * Checks if all messages in a campaign have reached a terminal status (SENT, DELIVERED, READ, FAILED)
   * and marks the campaign COMPLETED accordingly.
   */
  private async checkAndUpdateCampaignCompletion(campaignId: string): Promise<void> {
    try {
      const remainingUnfinished = await this.prisma.messageLog.count({
        where: {
          campaignId,
          deliveryStatus: {
            in: [DeliveryStatus.QUEUED],
          },
        },
      });

      if (remainingUnfinished === 0) {
        const campaign = await this.prisma.campaign.findUnique({
          where: { id: campaignId },
        });

        if (campaign && campaign.status === CampaignStatus.EXECUTING) {
          await this.prisma.campaign.update({
            where: { id: campaignId },
            data: {
              status: CampaignStatus.COMPLETED,
              completedAt: new Date(),
            },
          });
          this.logger.log(`🎉 Campaign ${campaign.name} (${campaignId}) marked COMPLETED`);
        }
      }
    } catch (err: any) {
      this.logger.warn(
        `Error checking campaign completion for ${campaignId}: ${err.message}`,
      );
    }
  }
}
