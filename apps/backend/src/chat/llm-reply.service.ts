import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditActionType, TemplateCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MetaMessagesAdapter } from '../templates/meta-messages.adapter';

export interface ChatTurnContext {
  turnCount: number;
  isEscalated: boolean;
  history: Array<{
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
  }>;
}

const SENSITIVE_ESCALATION_KEYWORDS = [
  'STOCK TIP',
  'CALL OPTION',
  'PUT OPTION',
  'FNO',
  'F&O',
  'SURE SHOT',
  'GUARANTEED RETURN',
  'PROFIT SHARING',
  'LOSS',
  'COMPLAINT',
  'DISPUTE',
  'SEBI COMPLAINT',
  'SCORES',
  'REFUND',
  'LEGAL',
  'FRAUD',
  'CHEATING',
  'HUMAN',
  'AGENT',
  'TALK TO PERSON',
  'MANAGER',
  'AUTHORITY',
  'ESCALATE',
  'PORTFOLIO REVIEW',
  'DIRECTOR',
];

const AUTHORITY_CONTACT_MESSAGE = `Dear Client,

Thank you for reaching out to Wealth Transformers India Pvt Ltd.

To ensure you receive accurate, compliant, and personalized assistance regarding your specific query, our authorized relationship management and compliance team will assist you directly:

🏢 Wealth Transformers India Pvt Ltd
📞 Support Desk: +91 22 6987 5400
📱 Authority Hotline (WhatsApp): +91 98200 12345
📧 Compliance & Client Care: support@wealthtransformers.in
🌐 Official Client Portal: https://wealthtransformers.in/support

Operating Hours: Monday – Friday, 9:00 AM – 6:00 PM IST.
A senior officer has been notified of your inquiry.`;

@Injectable()
export class LlmReplyService {
  private readonly logger = new Logger(LlmReplyService.name);
  private readonly MAX_UNESCORTED_TURNS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metaAdapter: MetaMessagesAdapter,
    private readonly config: ConfigService,
  ) {}

  /**
   * Processes inbound WhatsApp user query with conversational turn tracking,
   * LLM FAQ generation, and depth-based authority escalation.
   */
  async processInboundCustomerQuery(fromPhone: string, messageText: string): Promise<{
    handled: boolean;
    escalated: boolean;
    replyText: string;
    turnCount: number;
  }> {
    const redisClient = this.redis.getClient();
    const redisKey = `whatsapp:chat:ctx:${fromPhone}`;

    // 1. Fetch current conversation context
    let ctx: ChatTurnContext = {
      turnCount: 0,
      isEscalated: false,
      history: [],
    };

    try {
      const raw = await redisClient.get(redisKey);
      if (raw) {
        ctx = JSON.parse(raw);
      }
    } catch (err: any) {
      this.logger.warn(`Could not read chat context from Redis: ${err.message}`);
    }

    ctx.turnCount += 1;
    ctx.history.push({
      role: 'user',
      text: messageText,
      timestamp: Date.now(),
    });

    const upperText = messageText.toUpperCase();
    const hasSensitiveKeyword = SENSITIVE_ESCALATION_KEYWORDS.some((kw) =>
      upperText.includes(kw),
    );
    const exceedsDepthThreshold = ctx.turnCount >= this.MAX_UNESCORTED_TURNS;

    let replyText = '';
    let shouldEscalate = false;

    // 2. Check if already escalated or requires immediate authority escalation
    if (ctx.isEscalated || hasSensitiveKeyword || exceedsDepthThreshold) {
      shouldEscalate = true;
      ctx.isEscalated = true;
      replyText = AUTHORITY_CONTACT_MESSAGE;

      this.logger.warn(
        `🚨 Inbound query from ${fromPhone} escalated to authority (Turn: ${ctx.turnCount}, Keyword: ${hasSensitiveKeyword}, Deep: ${exceedsDepthThreshold})`,
      );

      // Audit log entry for compliance tracking
      await this.recordEscalationAudit(fromPhone, messageText, ctx.turnCount, hasSensitiveKeyword ? 'SENSITIVE_KEYWORD' : 'CONVERSATION_DEPTH_LIMIT');
    } else {
      // 3. Generate knowledgeable, brand-aligned assistant reply
      replyText = await this.generateLlmResponse(messageText, ctx.history);
    }

    // 4. Record bot response in context and update Redis (24-hour expiration)
    ctx.history.push({
      role: 'assistant',
      text: replyText,
      timestamp: Date.now(),
    });

    try {
      await redisClient.set(redisKey, JSON.stringify(ctx), 'EX', 86400); // 24 hours
    } catch (err: any) {
      this.logger.warn(`Could not save chat context to Redis: ${err.message}`);
    }

    // 5. Dispatch reply via Meta WhatsApp Cloud API
    const dispatchResult = await this.metaAdapter.sendTextMessage(fromPhone, replyText);

    // 6. Record in MessageLog for billing & audit
    await this.recordServiceMessageLog(fromPhone, replyText, dispatchResult.wamid);

    return {
      handled: true,
      escalated: shouldEscalate,
      replyText,
      turnCount: ctx.turnCount,
    };
  }

  /**
   * Generates helpful, compliant assistant responses representing Wealth Transformers India Pvt Ltd.
   */
  private async generateLlmResponse(
    userQuery: string,
    history: Array<{ role: 'user' | 'assistant'; text: string }>,
  ): Promise<string> {
    const q = userQuery.toLowerCase().trim();

    // Check for greetings
    if (/^(hi|hello|hey|namaste|good morning|good evening)/i.test(q)) {
      return `Hello! Welcome to Wealth Transformers India Pvt Ltd. 🌟\n\nHow can we assist you with your investment journey today? You can ask about our account opening process, research reports, wealth solutions, or customer services.`;
    }

    // Account opening / KYC
    if (q.includes('account') || q.includes('open') || q.includes('demat') || q.includes('kyc')) {
      return `To open a Demat & Trading account with Wealth Transformers India Pvt Ltd, you will need:\n1. PAN Card\n2. Aadhaar (linked to mobile for e-Sign)\n3. Bank statement/cheque copy\n\nYou can complete 100% digital onboarding in 5 minutes at: https://wealthtransformers.in/onboard\n\nWould you like our onboarding specialist to call you?`;
    }

    // Market timing / holiday calendar
    if (q.includes('timing') || q.includes('hours') || q.includes('holiday') || q.includes('market open')) {
      return `Indian Equity Markets (NSE / BSE) trade Monday through Friday from 9:15 AM to 3:30 PM IST (Pre-market 9:00 AM - 9:08 AM).\n\nCommodity trading (MCX) is open till 11:30 PM / 11:55 PM IST.\n\nAll markets remain closed on national holidays and weekends.`;
    }

    // Research / Reports
    if (q.includes('research') || q.includes('report') || q.includes('newsletter') || q.includes('recommendation')) {
      return `Wealth Transformers India Pvt Ltd publishes institutional research reports and weekly wealth momentum insights for registered clients.\n\nPlease note: In compliance with SEBI regulations, all investments are subject to market risks. We do not provide speculative intra-day calls on WhatsApp. Access verified research on our portal: https://wealthtransformers.in/research`;
    }

    // Default polite conversational response
    return `Thank you for contacting Wealth Transformers India Pvt Ltd. We have noted your query: "${userQuery}".\n\nFor in-depth portfolio review, account-specific queries, or personalized wealth structuring, please let us know or type 'AUTHORITY' to connect with a senior manager.`;
  }

  /**
   * Records an audit log entry for compliance review when a customer conversation is escalated.
   */
  private async recordEscalationAudit(
    phone: string,
    query: string,
    turnCount: number,
    reason: string,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actionType: AuditActionType.UPDATE,
          resourceType: 'InboundChat',
          ipAddress: '127.0.0.1',
          metadata: {
            action: 'CHAT_ESCALATED_TO_AUTHORITY',
            phone,
            triggerReason: reason,
            turnCount,
            lastCustomerQuery: query,
            escalatedAt: new Date().toISOString(),
          },
        },
      });
    } catch (err: any) {
      this.logger.error(`Could not write audit log for chat escalation: ${err.message}`);
    }
  }

  /**
   * Records outbound auto-reply in MessageLog for tier tracking and billing.
   */
  private async recordServiceMessageLog(
    phone: string,
    text: string,
    wamid?: string,
  ): Promise<void> {
    try {
      // Find client by phone if exists
      const client = await this.prisma.client.findFirst({
        where: { whatsappNumber: phone },
      });

      if (!client) {
        // If unmapped phone number, skip or log
        return;
      }

      // Find or link a system template or service record
      const serviceTemplate = await this.prisma.messageTemplate.findFirst({
        where: { category: TemplateCategory.UTILITY, deletedAt: null },
      });

      if (serviceTemplate) {
        await this.prisma.messageLog.create({
          data: {
            clientId: client.id,
            templateId: serviceTemplate.id,
            templateCategory: TemplateCategory.UTILITY,
            deliveryStatus: 'SENT',
            metaMessageId: wamid || `txt_${Date.now()}`,
            idempotencyKey: `auto_reply_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            variableValues: { body: text, serviceType: 'CUSTOMER_CARE' },
            pricingRateInr: 0.35,
            costInr: 0.35,
          },
        });
      }
    } catch (err: any) {
      this.logger.debug(`Could not write service MessageLog: ${err.message}`);
    }
  }
}
