import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from '../consent/consent.service';
import { LlmReplyService } from '../chat/llm-reply.service';
import { DeliveryStatus, ConsentStatus, ConsentSource, AuditActionType } from '@prisma/client';

const STATUS_RANKS: Record<DeliveryStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4,
  UNDELIVERABLE: 5,
};

const OPT_OUT_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'CANCEL', 'ROKO', 'BAND KARO'];
const OPT_IN_KEYWORDS = ['YES', 'START', 'UNSTOP', 'OPTIN', 'RESUME', 'HAAN', 'SHURU'];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consentService: ConsentService,
    private readonly llmReplyService: LlmReplyService,
  ) {}

  /**
   * Processes incoming Meta webhook payload asynchronously.
   * Handles delivery status updates (Property P3) and STOP keyword opt-outs.
   */
  async processWebhook(payload: any): Promise<void> {
    try {
      // 1. Save raw webhook event
      await this.prisma.webhookEvent.create({
        data: {
          rawPayload: payload as any,
          eventType: payload?.entry?.[0]?.changes?.[0]?.field || 'messages',
          expiresAt: new Date(Date.now() + 30 * 86400000), // 30 days retention
        },
      });

      const entries = payload?.entry || [];
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages') {
            const value = change.value || {};

            // Handle Delivery Status Callbacks (Monotonic Progression - Property P3)
            for (const status of value.statuses || []) {
              await this.handleStatusUpdate(status);
            }

            // Handle Incoming Messages (Opt-Out Detection)
            for (const msg of value.messages || []) {
              await this.handleIncomingMessage(msg);
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Error processing Meta webhook: ${err.message}`, err.stack);
    }
  }

  /**
   * Monotonic delivery status updater (Property P3).
   * Ensures status never regresses (e.g. READ -> DELIVERED).
   */
  private async handleStatusUpdate(status: any): Promise<void> {
    const wamid = status.id;
    const incomingStatus = (status.status || '').toUpperCase() as DeliveryStatus;
    const timestamp = new Date(parseInt(status.timestamp, 10) * 1000 || Date.now());

    if (!wamid || !STATUS_RANKS[incomingStatus]) return;

    const existingLog = await this.prisma.messageLog.findUnique({
      where: { metaMessageId: wamid },
    });

    if (!existingLog) {
      // Also check if this WAMID belongs to a direct custom message in AuditLog
      const customLogs = await this.prisma.auditLog.findMany({
        where: {
          resourceType: 'CUSTOM_MESSAGE',
          afterState: {
            path: ['wamid'],
            equals: wamid,
          },
        },
        take: 1,
      });

      if (customLogs.length > 0) {
        const customLog = customLogs[0];
        const prevState = (customLog.afterState as Record<string, any>) || {};
        const prevStatus = (prevState.status || 'SENT').toUpperCase() as DeliveryStatus;
        const prevRank = STATUS_RANKS[prevStatus] ?? 0;
        const nextRank = STATUS_RANKS[incomingStatus] ?? 0;

        if (nextRank > prevRank) {
          await this.prisma.auditLog.update({
            where: { id: customLog.id },
            data: {
              afterState: {
                ...prevState,
                status: incomingStatus,
              },
            },
          });
          this.logger.log(`Custom message status updated for ${wamid}: ${prevStatus} -> ${incomingStatus}`);
        }
      } else {
        this.logger.debug(`No MessageLog found for wamid ${wamid}`);
      }
      return;
    }

    const currentRank = STATUS_RANKS[existingLog.deliveryStatus] || 0;
    const nextRank = STATUS_RANKS[incomingStatus];

    // Monotonic guard: only update if next status rank is greater
    if (nextRank > currentRank) {
      const updateData: any = { deliveryStatus: incomingStatus };
      if (incomingStatus === DeliveryStatus.SENT) updateData.sentAt = timestamp;
      if (incomingStatus === DeliveryStatus.DELIVERED) updateData.deliveredAt = timestamp;
      if (incomingStatus === DeliveryStatus.READ) updateData.readAt = timestamp;
      if (incomingStatus === DeliveryStatus.FAILED) updateData.failedAt = timestamp;

      await this.prisma.messageLog.update({
        where: { id: existingLog.id },
        data: updateData,
      });

      this.logger.log(`Status monotonic transition for ${wamid}: ${existingLog.deliveryStatus} -> ${incomingStatus}`);
    }
  }

  /**
   * Handles incoming message text to detect STOP keywords and execute automated opt-out.
   */
  private async handleIncomingMessage(msg: any): Promise<void> {
    const rawBody = (msg?.text?.body || '').trim();
    const text = rawBody.toUpperCase();
    const fromPhone = `+${msg.from.replace(/^\+/, '')}`;

    const isOptOut = OPT_OUT_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' '));
    if (isOptOut) {
      this.logger.warn(`🛑 Opt-out keyword "${text}" received from ${fromPhone}`);

      await this.consentService.handleInboundOptOut({
        whatsappNumber: fromPhone,
        keyword: text,
        messageText: text,
      });
      return;
    }

    const isOptIn = OPT_IN_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' '));
    if (isOptIn) {
      this.logger.log(`✅ Inbound opt-in keyword "${text}" received from ${fromPhone}`);
      const client = await this.prisma.client.findFirst({
        where: { whatsappNumber: fromPhone },
      });
      if (client) {
        await this.consentService.optIn(
          client.id,
          `Inbound keyword trigger: ${text}`,
          ConsentSource.WHATSAPP_REPLY,
        );
      }
      return;
    }

    // Record inbound message in client's custom message timeline
    if (rawBody.length > 0) {
      const digits = fromPhone.replace(/[^\d]/g, '');
      const client = await this.prisma.client.findFirst({
        where: {
          OR: [
            { whatsappNumber: fromPhone },
            { whatsappNumber: digits },
            ...(digits.length >= 10 ? [{ whatsappNumber: { endsWith: digits.slice(-10) } }] : []),
          ],
          deletedAt: null,
        },
      });

      if (client) {
        await this.prisma.auditLog.create({
          data: {
            actionType: AuditActionType.CREATE,
            resourceType: 'CUSTOM_MESSAGE',
            resourceId: client.id,
            afterState: {
              direction: 'inbound',
              message: rawBody,
              wamid: msg.id || null,
              status: 'RECEIVED',
              from: fromPhone,
            },
          },
        });
      }

      this.logger.log(`💬 Inbound customer query from ${fromPhone}: "${rawBody}"`);
      await this.llmReplyService.processInboundCustomerQuery(fromPhone, rawBody);
    }
  }
}
