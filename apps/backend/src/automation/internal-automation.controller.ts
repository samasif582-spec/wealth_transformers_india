import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { ConsentService } from '../consent/consent.service';
import { AuditService } from '../audit/audit.service';
import { RedisService } from '../redis/redis.service';
import {
  CampaignStatus,
  CampaignType,
  ConsentStatus,
  DeliveryStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, getRedisConnection } from '../queue/queue.constants';
import * as crypto from 'crypto';

/**
 * Returns month and day in Asia/Kolkata timezone as "MM-DD".
 */
export function getISTDateMMDD(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${month}-${day}`;
}

/**
 * Returns current calendar year in Asia/Kolkata timezone (e.g. 2026).
 */
export function getISTYear(date: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
  });
  return parseInt(formatter.format(date), 10);
}

/**
 * Returns full date in Asia/Kolkata timezone as "YYYY-MM-DD".
 */
export function getISTDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

@Public()
@UseGuards(InternalApiKeyGuard)
@Controller('internal')
export class InternalAutomationController {
  private readonly logger = new Logger(InternalAutomationController.name);
  private campaignQueue?: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly consentService: ConsentService,
    private readonly auditService: AuditService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Optional() @Inject('QUEUE_CONFIG') private readonly injectedQueueConfig?: any,
    @Optional() @Inject('CAMPAIGN_QUEUE') private readonly injectedQueue?: Queue,
  ) {
    if (this.injectedQueue) {
      this.campaignQueue = this.injectedQueue;
    } else {
      try {
        const conn = this.injectedQueueConfig || getRedisConnection(this.config);
        this.campaignQueue = new Queue(QUEUE_NAMES.CAMPAIGN_MESSAGES, { connection: conn });
      } catch (err: any) {
        this.logger.warn(`Could not initialize campaign queue in InternalAutomationController: ${err.message}`);
      }
    }
  }

  /**
   * Returns clients whose date of birth matches today (or specified MM-DD) in Asia/Kolkata timezone.
   * Strictly enforces Property P1 (communication_consent = OPTED_IN) and Property P5 (deleted_at IS NULL).
   */
  @Get('automation/birthday-clients')
  async getBirthdayClients(@Query('date') date?: string) {
    const targetDate = date || getISTDateMMDD();

    const clients = await this.prisma.$queryRaw<
      Array<{ id: string; full_name: string; whatsapp_number: string; preferred_language: string }>
    >`
      SELECT id, full_name, whatsapp_number, preferred_language
      FROM clients
      WHERE TO_CHAR(date_of_birth, 'MM-DD') = ${targetDate}
        AND communication_consent = 'OPTED_IN'
        AND deleted_at IS NULL
        AND account_status = 'ACTIVE'
    `;

    return {
      date: targetDate,
      timezone: 'Asia/Kolkata',
      count: clients.length,
      clients,
    };
  }

  /**
   * Returns clients whose wedding anniversary matches today (or specified MM-DD) in Asia/Kolkata timezone.
   * Strictly enforces Property P1 & P5.
   */
  @Get('automation/anniversary-clients')
  async getAnniversaryClients(@Query('date') date?: string) {
    const targetDate = date || getISTDateMMDD();

    const clients = await this.prisma.$queryRaw<
      Array<{ id: string; full_name: string; whatsapp_number: string; preferred_language: string }>
    >`
      SELECT id, full_name, whatsapp_number, preferred_language
      FROM clients
      WHERE TO_CHAR(wedding_anniversary, 'MM-DD') = ${targetDate}
        AND communication_consent = 'OPTED_IN'
        AND deleted_at IS NULL
        AND account_status = 'ACTIVE'
    `;

    return {
      date: targetDate,
      timezone: 'Asia/Kolkata',
      count: clients.length,
      clients,
    };
  }

  /**
   * Returns festival campaigns scheduled for today within Asia/Kolkata calendar day boundaries.
   * Called by n8n Workflow 03 (03-festival-dispatch.json).
   */
  @Get('automation/festival-scheduled-today')
  async getFestivalScheduledToday(@Query('date') dateQuery?: string) {
    const dateStr = dateQuery || getISTDateString();

    // Calculate start and end of calendar day in Asia/Kolkata converted to UTC
    const startOfDayUTC = new Date(`${dateStr}T00:00:00+05:30`);
    const endOfDayUTC = new Date(`${dateStr}T23:59:59.999+05:30`);

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        campaignType: CampaignType.FESTIVAL,
        status: { in: [CampaignStatus.APPROVED, CampaignStatus.SCHEDULED] },
        dispatchedAt: null, // Only campaigns not yet executed
        scheduledAt: {
          gte: startOfDayUTC,
          lte: endOfDayUTC,
        },
      },
      select: {
        id: true,
        name: true,
        templateId: true,
        scheduledAt: true,
        resolvedRecipientCount: true,
      },
      orderBy: { scheduledAt: 'asc' },
    });

    this.logger.log(
      `Festival check for ${dateStr} (Asia/Kolkata): Found ${campaigns.length} eligible campaigns`,
    );

    return {
      date: dateStr,
      timezone: 'Asia/Kolkata',
      count: campaigns.length,
      campaigns,
    };
  }

  /**
   * Batch enqueues automated messages into the BullMQ pipeline with annual deduplication.
   * Resolves system approved templates, validates consent, creates MessageLog records,
   * and pushes to BullMQ with deterministic idempotency keys.
   */
  @Post('campaigns/batch-enqueue')
  @HttpCode(HttpStatus.OK)
  async batchEnqueue(
    @Body()
    body: {
      type: string;
      items?: any[];
      clients?: any[];
    },
  ) {
    const rawType = (body.type || '').toUpperCase();
    if (rawType !== 'BIRTHDAY' && rawType !== 'ANNIVERSARY' && rawType !== 'FESTIVAL') {
      throw new BadRequestException(
        `Invalid automation type: "${body.type}". Supported types: BIRTHDAY, ANNIVERSARY, FESTIVAL.`,
      );
    }

    // 1. Flatten and normalize client entries from various n8n payload forms
    const normalizedClients: Array<{
      id: string;
      fullName: string;
      whatsappNumber: string;
    }> = [];

    const sourceList = body.items || body.clients || [];
    for (const entry of sourceList) {
      if (!entry) continue;

      // Case A: Entry contains a nested 'clients' array (from HTTP response nodes)
      if (Array.isArray(entry.clients)) {
        for (const sub of entry.clients) {
          if (sub && (sub.id || sub.clientId)) {
            normalizedClients.push({
              id: sub.id || sub.clientId,
              fullName: sub.full_name || sub.fullName || 'Valued Client',
              whatsappNumber: sub.whatsapp_number || sub.whatsappNumber || '',
            });
          }
        }
      }
      // Case B: Entry is directly a client object
      else if (entry.id || entry.clientId) {
        normalizedClients.push({
          id: entry.id || entry.clientId,
          fullName: entry.full_name || entry.fullName || 'Valued Client',
          whatsappNumber: entry.whatsapp_number || entry.whatsappNumber || '',
        });
      }
    }

    // Deduplicate incoming client list by ID
    const uniqueClientsMap = new Map<string, { id: string; fullName: string; whatsappNumber: string }>();
    for (const c of normalizedClients) {
      if (!uniqueClientsMap.has(c.id)) {
        uniqueClientsMap.set(c.id, c);
      }
    }
    const clientsToProcess = Array.from(uniqueClientsMap.values());

    this.logger.log(
      `📥 Batch enqueue: ${rawType} wishes for ${clientsToProcess.length} clients`,
    );

    // 2. Resolve System Approved Template
    let template: any = null;
    if (rawType === 'BIRTHDAY') {
      template = await this.prisma.messageTemplate.findFirst({
        where: {
          OR: [
            { name: 'daily_birthday_wishes_v1' },
            { name: 'birthday_vip_wishes_v1' },
            { name: { contains: 'birthday', mode: 'insensitive' } },
          ],
          status: TemplateStatus.APPROVED,
        },
        include: {
          versions: {
            where: { status: TemplateStatus.APPROVED },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });
    } else if (rawType === 'ANNIVERSARY') {
      template = await this.prisma.messageTemplate.findFirst({
        where: {
          OR: [
            { name: 'wedding_anniversary_wishes_v1' },
            { name: 'anniversary_vip_wishes_v1' },
            { name: { contains: 'anniversary', mode: 'insensitive' } },
          ],
          status: TemplateStatus.APPROVED,
        },
        include: {
          versions: {
            where: { status: TemplateStatus.APPROVED },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });
    } else if (rawType === 'FESTIVAL') {
      template = await this.prisma.messageTemplate.findFirst({
        where: {
          OR: [
            { name: 'diwali_special_greeting_v1' },
            { name: 'wealth_trade_diwali_2024' },
            { name: { contains: 'festival', mode: 'insensitive' } },
            { category: TemplateCategory.MARKETING },
          ],
          status: TemplateStatus.APPROVED,
        },
        include: {
          versions: {
            where: { status: TemplateStatus.APPROVED },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });
    }

    // Fallback if named template isn't seeded yet
    if (!template) {
      template = await this.prisma.messageTemplate.findFirst({
        where: {
          status: TemplateStatus.APPROVED,
        },
        include: {
          versions: {
            where: { status: TemplateStatus.APPROVED },
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });
    }

    if (!template) {
      throw new BadRequestException(
        `No approved ${rawType} message template found in database.`,
      );
    }

    const currentYear = getISTYear();
    let enqueuedCount = 0;
    let skippedCount = 0;
    let rejectedCount = 0;

    // 3. Process each client with annual idempotency key
    for (const client of clientsToProcess) {
      // Re-validate consent in DB
      const dbClient = await this.prisma.client.findUnique({
        where: { id: client.id },
      });

      if (
        !dbClient ||
        dbClient.deletedAt !== null ||
        dbClient.accountStatus !== 'ACTIVE' ||
        dbClient.communicationConsent !== ConsentStatus.OPTED_IN
      ) {
        rejectedCount++;
        continue;
      }

      // Check Redis suppression
      const phone = dbClient.whatsappNumber || client.whatsappNumber;
      const isSuppressed =
        (await this.redis.get(`consent:suppressed:${client.id}`)) ||
        (await this.redis.get(`suppression:${phone}`));

      if (isSuppressed) {
        rejectedCount++;
        continue;
      }

      // Generate deterministic annual idempotency key: SHA256(TYPE:clientId:YEAR)
      const idempotencyKey = crypto
        .createHash('sha256')
        .update(`${rawType}:${client.id}:${currentYear}`)
        .digest('hex');

      try {
        // Attempt to create MessageLog in QUEUED state.
        // If this client already received a wish this year, the UNIQUE constraint on idempotency_key throws P2002.
        await this.prisma.messageLog.create({
          data: {
            clientId: client.id,
            templateId: template.id,
            templateCategory: template.category,
            idempotencyKey,
            deliveryStatus: DeliveryStatus.QUEUED,
            variableValues: { '1': dbClient.fullName },
            pricingRateInr: rawType === 'FESTIVAL' ? 0.7854 : 0.1258,
          },
        });

        // Add job to BullMQ queue if initialized
        if (this.campaignQueue) {
          await this.campaignQueue.add(
            'send-message',
            {
              clientId: client.id,
              phone,
              clientName: dbClient.fullName,
              templateId: template.id,
              idempotencyKey,
            },
            {
              jobId: idempotencyKey, // BullMQ deduplication by job ID
              attempts: 5,
              backoff: { type: 'exponential', delay: 30000 },
            },
          );
        }

        enqueuedCount++;
      } catch (err: any) {
        // Unique constraint violation: already enqueued/sent in this calendar year
        if (err.code === 'P2002') {
          skippedCount++;
        } else {
          this.logger.error(
            `Error enqueuing ${rawType} message for client ${client.id}: ${err.message}`,
          );
          rejectedCount++;
        }
      }
    }

    // 4. Record Automation Execution log if rule exists
    try {
      const rule = await this.prisma.automationRule.findFirst({
        where: { ruleType: rawType as any },
      });

      if (rule) {
        await this.prisma.automationExecution.create({
          data: {
            ruleId: rule.id,
            status: 'COMPLETED',
            clientsProcessed: clientsToProcess.length,
            messagesQueued: enqueuedCount,
            startedAt: new Date(),
            completedAt: new Date(),
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not record AutomationExecution: ${err.message}`);
    }

    this.logger.log(
      `✅ Batch enqueue completed: ${enqueuedCount} queued, ${skippedCount} skipped (already sent this year), ${rejectedCount} rejected`,
    );

    return {
      status: 'QUEUED',
      type: rawType,
      year: currentYear,
      processed: clientsToProcess.length,
      enqueued: enqueuedCount,
      skipped: skippedCount,
      rejected: rejectedCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Triggers execution of a scheduled or festival campaign from n8n.
   */
  @Post('campaigns/:id/execute')
  @HttpCode(HttpStatus.OK)
  async executeCampaign(@Param('id') campaignId: string) {
    return this.campaignsService.dispatch(campaignId);
  }

  /**
   * Inbound STOP / Opt-Out triggered by n8n keyword matching.
   */
  @Post('clients/opt-out-by-phone')
  @HttpCode(HttpStatus.OK)
  async optOutByPhone(
    @Body() body: { phone: string; reason: string; source?: string },
  ) {
    const res = await this.consentService.handleInboundOptOut({
      whatsappNumber: body.phone,
      keyword: body.reason || 'STOP',
      messageText: body.reason || 'Opt-out keyword received via WhatsApp',
    });

    if (!res.success) {
      throw new NotFoundException(`Client with WhatsApp number ${body.phone} not found`);
    }

    return {
      clientId: res.clientId,
      phone: body.phone,
      status: 'OPTED_OUT',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Inbound error report from n8n Global Error Handler (Workflow 08).
   */
  @Post('automation/execution-error')
  @HttpCode(HttpStatus.OK)
  async recordExecutionError(@Body() body: any) {
    this.logger.error(`🚨 n8n Execution Error: ${JSON.stringify(body)}`);

    await this.auditService.log({
      actionType: 'UPDATE',
      resourceType: 'AutomationWorkflow',
      metadata: body,
    });

    return { success: true, loggedAt: new Date().toISOString() };
  }
}
