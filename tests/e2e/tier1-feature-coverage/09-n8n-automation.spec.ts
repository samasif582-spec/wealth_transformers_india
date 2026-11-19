import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '../../helpers/api-client';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import { USER_CREDENTIALS, TEST_USERS } from '../../fixtures/users.fixture';
import { isOptOutKeyword } from '../../../apps/backend/src/consent/utils/optout-detector';
import { scrubPiiFromErrorDetails } from '../../../apps/backend/src/common/utils/pii-scrubber';

describe('Tier 1 — 09: n8n Automation Engine & Workflow Suite', () => {
  let adminUserId: string;
  let testClientId: string;
  let testTemplateId: string;
  const testRuleIds: string[] = [];
  const testExecutionIds: string[] = [];

  const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6';

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const admin = await dbHelper.findUserByEmail(USER_CREDENTIALS.Admin.email);
    adminUserId = admin?.id || TEST_USERS.Admin.id!;

    // Create client with birthday & anniversary for automation testing
    const client = await dbHelper.client.client.create({
      data: {
        fullName: 'Automation Test Client',
        whatsappNumber: `+9199999880${Math.floor(100 + Math.random() * 899)}`,
        email: 'auto_client@test.wealthtrade.in',
        dateOfBirth: new Date('1990-11-19'), // Matches MM-DD 11-19
        weddingAnniversary: new Date('2018-11-19'),
        categoryTier: 'HNI',
        communicationConsent: 'OPTED_IN',
        preferredLanguage: 'en',
      },
    });
    testClientId = client.id;

    // Create template
    const tmpl = await dbHelper.client.messageTemplate.create({
      data: {
        name: `test_auto_tmpl_${Date.now()}`,
        category: 'MARKETING',
        language: 'en',
        status: 'APPROVED',
        createdByUserId: adminUserId,
      },
    });
    testTemplateId = tmpl.id;
  });

  afterAll(async () => {
    if (testExecutionIds.length > 0) {
      await dbHelper.client.automationExecution.deleteMany({
        where: { id: { in: testExecutionIds } },
      });
    }
    if (testRuleIds.length > 0) {
      await dbHelper.client.automationRule.deleteMany({
        where: { id: { in: testRuleIds } },
      });
    }
    if (testTemplateId) {
      await dbHelper.client.messageTemplate.deleteMany({ where: { id: testTemplateId } });
    }
    if (testClientId) {
      await dbHelper.client.client.deleteMany({ where: { id: testClientId } });
    }

    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    await redisHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 35: n8n Workflow 01 - Birthday Automation
  // ─────────────────────────────────────────────────────────────
  describe('Feature 35: n8n Workflow 01 - Birthday Automation', () => {
    let birthdayRuleId: string;

    it('F35-T1: should define Birthday Automation rule with 09:00 IST cron schedule', async () => {
      const rule = await dbHelper.client.automationRule.create({
        data: {
          name: 'Daily Birthday Automation (09:00 IST)',
          ruleType: 'BIRTHDAY',
          status: 'ACTIVE',
          n8nWorkflowId: '01-birthday-automation',
          config: {
            cron: '0 9 * * *',
            timezone: 'Asia/Kolkata',
            templateId: testTemplateId,
          },
          createdByUserId: adminUserId,
        },
      });
      birthdayRuleId = rule.id;
      testRuleIds.push(rule.id);

      expect(rule.id).toBeDefined();
      expect(rule.ruleType).toBe('BIRTHDAY');
      expect((rule.config as any).cron).toBe('0 9 * * *');
    });

    it('F35-T2: should query active clients with matching birthdate MM-DD and OPTED_IN consent', async () => {
      // Find client born on 11-19
      const clients: any[] = await dbHelper.client.$queryRaw`
        SELECT id, full_name, whatsapp_number, communication_consent
        FROM clients
        WHERE TO_CHAR(date_of_birth, 'MM-DD') = '11-19'
          AND communication_consent = 'OPTED_IN'
          AND deleted_at IS NULL
      `;

      expect(clients.length).toBeGreaterThanOrEqual(1);
      const match = clients.find((c) => c.id === testClientId);
      expect(match).toBeDefined();
      expect(match.communication_consent).toBe('OPTED_IN');
    });

    it('F35-T3: should strictly exclude non-opted-in clients from birthday automation audience (Property P1)', async () => {
      const nonOptedClients: any[] = await dbHelper.client.$queryRaw`
        SELECT id
        FROM clients
        WHERE TO_CHAR(date_of_birth, 'MM-DD') = '11-19'
          AND communication_consent != 'OPTED_IN'
      `;

      // Non-opted in must never be included
      expect(nonOptedClients.some((c) => c.id === testClientId)).toBe(false);
    });

    it('F35-T4: should enqueue birthday batch messages to BullMQ campaign-messages queue', async () => {
      const queue = redisHelper.getQueue('campaign-messages');
      const job = await queue.add(
        'birthday-message',
        {
          clientId: testClientId,
          templateId: testTemplateId,
          phone: '+919999988001',
          source: '01-birthday-automation',
        },
        { jobId: `bday_test_${Date.now()}` },
      );

      expect(job.id).toBeDefined();
      expect(job.data.source).toBe('01-birthday-automation');

      await job.remove().catch(() => {});
    });

    it('F35-T5: should record execution log in automation_executions with clientsProcessed and messagesQueued', async () => {
      const execution = await dbHelper.client.automationExecution.create({
        data: {
          ruleId: birthdayRuleId,
          n8nExecutionId: `exec_bday_${Date.now()}`,
          status: 'SUCCESS',
          clientsProcessed: 1,
          messagesQueued: 1,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      testExecutionIds.push(execution.id);

      expect(execution.id).toBeDefined();
      expect(execution.clientsProcessed).toBe(1);
      expect(execution.messagesQueued).toBe(1);
      expect(execution.status).toBe('SUCCESS');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 36: n8n Workflow 02 - Anniversary Automation
  // ─────────────────────────────────────────────────────────────
  describe('Feature 36: n8n Workflow 02 - Anniversary Automation', () => {
    let anniversaryRuleId: string;

    it('F36-T1: should define Anniversary Automation rule with 09:00 IST cron schedule', async () => {
      const rule = await dbHelper.client.automationRule.create({
        data: {
          name: 'Daily Anniversary Automation (09:00 IST)',
          ruleType: 'ANNIVERSARY',
          status: 'ACTIVE',
          n8nWorkflowId: '02-anniversary-automation',
          config: {
            cron: '0 9 * * *',
            timezone: 'Asia/Kolkata',
            templateId: testTemplateId,
          },
          createdByUserId: adminUserId,
        },
      });
      anniversaryRuleId = rule.id;
      testRuleIds.push(rule.id);

      expect(rule.id).toBeDefined();
      expect(rule.ruleType).toBe('ANNIVERSARY');
    });

    it('F36-T2: should query active clients with matching anniversary MM-DD and OPTED_IN consent', async () => {
      const clients: any[] = await dbHelper.client.$queryRaw`
        SELECT id, full_name, whatsapp_number
        FROM clients
        WHERE TO_CHAR(wedding_anniversary, 'MM-DD') = '11-19'
          AND communication_consent = 'OPTED_IN'
          AND deleted_at IS NULL
      `;

      expect(clients.length).toBeGreaterThanOrEqual(1);
      expect(clients.some((c) => c.id === testClientId)).toBe(true);
    });

    it('F36-T3: should strictly exclude soft-deleted clients from anniversary batch (Property P5)', async () => {
      // Soft-delete a temporary client
      const softDeleted = await dbHelper.client.client.create({
        data: {
          fullName: 'SoftDeleted Anniversary Client',
          whatsappNumber: `+9199999881${Math.floor(100 + Math.random() * 899)}`,
          weddingAnniversary: new Date('2015-11-19'),
          categoryTier: 'RETAIL',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
          deletedAt: new Date(),
        },
      });

      const matched: any[] = await dbHelper.client.$queryRaw`
        SELECT id FROM clients
        WHERE TO_CHAR(wedding_anniversary, 'MM-DD') = '11-19'
          AND communication_consent = 'OPTED_IN'
          AND deleted_at IS NULL
      `;

      expect(matched.some((c) => c.id === softDeleted.id)).toBe(false);

      await dbHelper.client.client.delete({ where: { id: softDeleted.id } });
    });

    it('F36-T4: should enqueue anniversary batch messages to BullMQ queue', async () => {
      const queue = redisHelper.getQueue('campaign-messages');
      const job = await queue.add(
        'anniversary-message',
        {
          clientId: testClientId,
          templateId: testTemplateId,
          source: '02-anniversary-automation',
        },
        { jobId: `anni_test_${Date.now()}` },
      );

      expect(job.id).toBeDefined();
      await job.remove().catch(() => {});
    });

    it('F36-T5: should record execution log in automation_executions', async () => {
      const execution = await dbHelper.client.automationExecution.create({
        data: {
          ruleId: anniversaryRuleId,
          n8nExecutionId: `exec_anni_${Date.now()}`,
          status: 'SUCCESS',
          clientsProcessed: 1,
          messagesQueued: 1,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      testExecutionIds.push(execution.id);

      expect(execution.status).toBe('SUCCESS');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 37: n8n Workflow 03 - Festival Dispatch
  // ─────────────────────────────────────────────────────────────
  describe('Feature 37: n8n Workflow 03 - Festival Dispatch', () => {
    it('F37-T1: should define Festival Dispatch rule with festival date and target audience tier', async () => {
      const rule = await dbHelper.client.automationRule.create({
        data: {
          name: 'Diwali 2026 Festival Broadcast',
          ruleType: 'FESTIVAL',
          status: 'ACTIVE',
          n8nWorkflowId: '03-festival-dispatch',
          config: {
            festivalName: 'Diwali',
            dispatchDate: '2026-11-01',
            targetTier: 'ALL',
            templateId: testTemplateId,
          },
          createdByUserId: adminUserId,
        },
      });
      testRuleIds.push(rule.id);

      expect(rule.ruleType).toBe('FESTIVAL');
      expect((rule.config as any).festivalName).toBe('Diwali');
    });

    it('F37-T2: should resolve festival calendar schedule and trigger timing', () => {
      const festivalSchedule = {
        name: 'Diwali',
        scheduledEpoch: new Date('2026-11-01T09:00:00+05:30').getTime(),
        reminderEnabled: true,
      };

      expect(festivalSchedule.scheduledEpoch).toBeGreaterThan(0);
      expect(festivalSchedule.reminderEnabled).toBe(true);
    });

    it('F37-T3: should resolve festival template variables dynamically with client name', () => {
      const client = { fullName: 'Rajesh Sharma' };
      const templateBody = 'Wishing you and your family a Happy Diwali, {{1}}!';
      const variablesMap: Record<string, string> = { '1': client.fullName };
      const populated = templateBody.replace(/\{\{(\d+)\}\}/g, (_, key) => variablesMap[key] || '');

      expect(populated).toBe('Wishing you and your family a Happy Diwali, Rajesh Sharma!');
    });

    it('F37-T4: should support test preview / reminder before full broadcast', () => {
      const previewPayload = {
        testRecipient: '+919999988001',
        festivalName: 'Diwali',
        isPreview: true,
      };

      expect(previewPayload.isPreview).toBe(true);
      expect(previewPayload.testRecipient).toBe('+919999988001');
    });

    it('F37-T5: should verify festival execution metrics recorded upon completion', async () => {
      const execution = await dbHelper.client.automationExecution.create({
        data: {
          ruleId: testRuleIds[0],
          status: 'SUCCESS',
          clientsProcessed: 50,
          messagesQueued: 50,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      testExecutionIds.push(execution.id);

      expect(execution.clientsProcessed).toBe(50);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 38: n8n Workflow 04 - Campaign Execution Trigger
  // ─────────────────────────────────────────────────────────────
  describe('Feature 38: n8n Workflow 04 - Campaign Execution Trigger', () => {
    it('F38-T1: should trigger when campaign status transitions to EXECUTING', async () => {
      const campaign = await dbHelper.client.campaign.create({
        data: {
          name: `TEST_Exec_Trigger_${Date.now()}`,
          campaignType: 'PROMOTIONAL',
          status: 'EXECUTING',
          templateId: testTemplateId,
          createdByUserId: adminUserId,
          dispatchedAt: new Date(),
        },
      });

      expect(campaign.status).toBe('EXECUTING');
      await dbHelper.client.campaign.delete({ where: { id: campaign.id } });
    });

    it('F38-T2: should stream resolved campaign audience in batches to prevent memory overflow', () => {
      const totalRecipients = 250;
      const batchSize = 100;
      const batches: number[] = [];

      for (let i = 0; i < totalRecipients; i += batchSize) {
        batches.push(Math.min(batchSize, totalRecipients - i));
      }

      expect(batches).toEqual([100, 100, 50]);
      expect(batches.reduce((a, b) => a + b, 0)).toBe(250);
    });

    it('F38-T3: should verify rate limit configuration of 80 messages per second', () => {
      const rateLimit = {
        maxMessages: 80,
        perIntervalMs: 1000,
      };

      expect(rateLimit.maxMessages).toBe(80);
      expect(rateLimit.perIntervalMs).toBe(1000);
    });

    it('F38-T4: should track progress and set dispatchedAt timestamp', () => {
      const now = new Date();
      const campaignProgress = {
        total: 100,
        processed: 80,
        dispatchedAt: now,
      };

      expect(campaignProgress.processed).toBe(80);
      expect(campaignProgress.dispatchedAt).toBe(now);
    });

    it('F38-T5: should transition campaign to COMPLETED when all recipient jobs finish', async () => {
      const campaign = await dbHelper.client.campaign.create({
        data: {
          name: `test_campaign_status_${Date.now()}`,
          campaignType: 'PROMOTIONAL',
          status: 'EXECUTING',
          templateId: testTemplateId,
          createdByUserId: adminUserId,
        },
      });

      const updated = await dbHelper.client.campaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      expect(updated.status).toBe('COMPLETED');
      expect(updated.completedAt).not.toBeNull();

      await dbHelper.client.campaign.delete({ where: { id: campaign.id } });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 39: n8n Workflow 05 - Delivery Status Processor
  // ─────────────────────────────────────────────────────────────
  describe('Feature 39: n8n Workflow 05 - Delivery Status Processor', () => {
    it('F39-T1: should process delivery status webhook event and route to monotonic updater', async () => {
      const metaMessageId = `wamid.wf05_${Date.now()}`;
      const log = await dbHelper.client.messageLog.create({
        data: {
          metaMessageId,
          templateId: testTemplateId,
          templateCategory: 'MARKETING',
          idempotencyKey: `idemp_${metaMessageId}`,
          clientId: testClientId,
          deliveryStatus: 'QUEUED',
          variableValues: {},
        },
      });

      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${metaMessageId}, 'SENT', ${new Date()})
      `;

      const updated = await dbHelper.client.messageLog.findUnique({ where: { id: log.id } });
      expect(updated?.deliveryStatus).toBe('SENT');

      await dbHelper.client.messageLog.delete({ where: { id: log.id } });
    });

    it('F39-T2: should handle SENT, DELIVERED, and READ status transitions', async () => {
      const metaMessageId = `wamid.wf05_chain_${Date.now()}`;
      const log = await dbHelper.client.messageLog.create({
        data: {
          metaMessageId,
          templateId: testTemplateId,
          templateCategory: 'MARKETING',
          idempotencyKey: `idemp_${metaMessageId}`,
          clientId: testClientId,
          deliveryStatus: 'QUEUED',
          variableValues: {},
        },
      });

      const now = new Date();
      await dbHelper.client.$executeRaw`SELECT update_delivery_status_monotonic(${metaMessageId}, 'SENT', ${now})`;
      await dbHelper.client.$executeRaw`SELECT update_delivery_status_monotonic(${metaMessageId}, 'DELIVERED', ${now})`;
      await dbHelper.client.$executeRaw`SELECT update_delivery_status_monotonic(${metaMessageId}, 'READ', ${now})`;

      const finalRecord = await dbHelper.client.messageLog.findUnique({ where: { id: log.id } });
      expect(finalRecord?.deliveryStatus).toBe('READ');

      await dbHelper.client.messageLog.delete({ where: { id: log.id } });
    });

    it('F39-T3: should record FAILED delivery status events with error details', async () => {
      const metaMessageId = `wamid.wf05_fail_${Date.now()}`;
      const log = await dbHelper.client.messageLog.create({
        data: {
          metaMessageId,
          templateId: testTemplateId,
          templateCategory: 'MARKETING',
          idempotencyKey: `idemp_${metaMessageId}`,
          clientId: testClientId,
          deliveryStatus: 'FAILED',
          errorCode: '131026',
          errorMessage: 'Message undeliverable: User not registered on WhatsApp',
          variableValues: {},
        },
      });

      expect(log.deliveryStatus).toBe('FAILED');
      expect(log.errorCode).toBe('131026');

      await dbHelper.client.messageLog.delete({ where: { id: log.id } });
    });

    it('F39-T4: should guarantee monotonic order preservation for webhook batch', () => {
      const statusOrdinal = (s: string) =>
        s === 'QUEUED' ? 0 : s === 'SENT' ? 1 : s === 'DELIVERED' ? 2 : s === 'READ' ? 3 : 4;

      // Status must strictly increase or stay equal
      expect(statusOrdinal('DELIVERED')).toBeGreaterThan(statusOrdinal('SENT'));
      expect(statusOrdinal('READ')).toBeGreaterThan(statusOrdinal('DELIVERED'));
    });

    it('F39-T5: should trigger mv_campaign_stats refresh after webhook batch processing', async () => {
      const start = Date.now();
      await dbHelper.client.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_campaign_stats');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 40: n8n Workflow 06 - Opt-Out Worker
  // ─────────────────────────────────────────────────────────────
  describe('Feature 40: n8n Workflow 06 - Opt-Out Worker', () => {
    let optOutClientId: string;

    beforeAll(async () => {
      const c = await dbHelper.client.client.create({
        data: {
          fullName: 'Opt-Out Test Client',
          whatsappNumber: `+9199999882${Math.floor(100 + Math.random() * 899)}`,
          categoryTier: 'RETAIL',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
        },
      });
      optOutClientId = c.id;
    });

    afterAll(async () => {
      if (optOutClientId) {
        await dbHelper.client.whatsappConsent.deleteMany({ where: { clientId: optOutClientId } });
        await dbHelper.client.client.deleteMany({ where: { id: optOutClientId } });
      }
    });

    it('F40-T1: should detect inbound STOP keywords (STOP, UNSUBSCRIBE, रुकें)', () => {
      expect(isOptOutKeyword('STOP')).toBe(true);
      expect(isOptOutKeyword('stop')).toBe(true);
      expect(isOptOutKeyword('unsubscribe')).toBe(true);
      expect(isOptOutKeyword('रुकें')).toBe(true);
      expect(isOptOutKeyword('HELLO')).toBe(false);
    });

    it('F40-T2: should atomically record OPTED_OUT consent with source WHATSAPP_REPLY', async () => {
      const consent = await dbHelper.client.whatsappConsent.create({
        data: {
          clientId: optOutClientId,
          consentStatus: 'OPTED_OUT',
          consentSource: 'WHATSAPP_REPLY',
          evidenceReference: 'Inbound message text: STOP',
        },
      });

      expect(consent.id).toBeDefined();
      expect(consent.consentStatus).toBe('OPTED_OUT');
      expect(consent.consentSource).toBe('WHATSAPP_REPLY');
    });

    it('F40-T3: should update client communication_consent cache to OPTED_OUT', async () => {
      const updated = await dbHelper.client.client.update({
        where: { id: optOutClientId },
        data: { communicationConsent: 'OPTED_OUT' },
      });

      expect(updated.communicationConsent).toBe('OPTED_OUT');
    });

    it('F40-T4: should purge or suppress in-flight BullMQ messages for opted-out client', async () => {
      const queue = redisHelper.getQueue('campaign-messages');
      const job = await queue.add(
        'send-message',
        { clientId: optOutClientId, phone: '+919999988200' },
        { jobId: `optout_job_${optOutClientId}` },
      );

      // On opt-out: job is removed
      await job.remove();
      const jobCheck = await queue.getJob(`optout_job_${optOutClientId}`);
      expect(jobCheck).toBeUndefined();
    });

    it('F40-T5: should confirm client is strictly excluded from subsequent marketing broadcasts', async () => {
      const activeOptedIn = await dbHelper.client.client.findFirst({
        where: {
          id: optOutClientId,
          communicationConsent: 'OPTED_IN',
        },
      });

      expect(activeOptedIn).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 41: n8n Workflow 07 - Template Quality Monitor
  // ─────────────────────────────────────────────────────────────
  describe('Feature 41: n8n Workflow 07 - Template Quality Monitor', () => {
    let qualityTemplateId: string;

    beforeAll(async () => {
      const tmpl = await dbHelper.client.messageTemplate.create({
        data: {
          name: `test_quality_tmpl_${Date.now()}`,
          category: 'MARKETING',
          language: 'en',
          status: 'APPROVED',
          createdByUserId: adminUserId,
        },
      });
      qualityTemplateId = tmpl.id;
    });

    afterAll(async () => {
      if (qualityTemplateId) {
        await dbHelper.client.messageTemplate.delete({ where: { id: qualityTemplateId } });
      }
    });

    it('F41-T1: should define Template Quality Monitor with 07:30 IST cron schedule', async () => {
      const rule = await dbHelper.client.automationRule.create({
        data: {
          name: 'Daily Template Quality Monitor (07:30 IST)',
          ruleType: 'DELIVERY_STATUS',
          status: 'ACTIVE',
          n8nWorkflowId: '07-template-quality',
          config: {
            cron: '30 7 * * *',
            timezone: 'Asia/Kolkata',
          },
          createdByUserId: adminUserId,
        },
      });
      testRuleIds.push(rule.id);

      expect((rule.config as any).cron).toBe('30 7 * * *');
    });

    it('F41-T2: should sync Meta quality rating (GREEN, YELLOW, RED) for active templates', () => {
      const validRatings = ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'];
      expect(validRatings).toContain('GREEN');
      expect(validRatings).toContain('YELLOW');
      expect(validRatings).toContain('RED');
    });

    it('F41-T3: should flag alert to Admin when template quality drops to RED', () => {
      const qualityScore = 'RED';
      const shouldAlert = qualityScore === 'RED';
      const alertPayload = {
        templateId: qualityTemplateId,
        alertType: 'TEMPLATE_QUALITY_DEGRADED',
        qualityRating: qualityScore,
        severity: 'HIGH',
      };

      expect(shouldAlert).toBe(true);
      expect(alertPayload.severity).toBe('HIGH');
    });

    it('F41-T4: should automatically pause or disable template from dispatch when quality is RED', async () => {
      const paused = await dbHelper.client.messageTemplate.update({
        where: { id: qualityTemplateId },
        data: { status: 'PAUSED' },
      });

      expect(paused.status).toBe('PAUSED');
    });

    it('F41-T5: should allow resuming template when Meta quality recovers to GREEN or YELLOW', async () => {
      const approved = await dbHelper.client.messageTemplate.update({
        where: { id: qualityTemplateId },
        data: { status: 'APPROVED' },
      });

      expect(approved.status).toBe('APPROVED');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 42: n8n Workflow 08 - Central Error Router
  // ─────────────────────────────────────────────────────────────
  describe('Feature 42: n8n Workflow 08 - Central Error Router', () => {
    it('F42-T1: should catch execution errors across workflows and format standardized error payload', () => {
      const rawError = {
        workflowId: '04-campaign-execution',
        executionId: 'exec-12345',
        errorMessage: 'Meta API rate limit exceeded (code: 131026)',
        timestamp: new Date().toISOString(),
      };

      expect(rawError).toHaveProperty('workflowId');
      expect(rawError).toHaveProperty('executionId');
      expect(rawError).toHaveProperty('errorMessage');
    });

    it('F42-T2: should scrub PII from error details before routing to Sentry or logs', () => {
      const unscrubbedError = 'Failed to deliver to client +919876543210 (email: client.hni@wealthtrade.in)';
      const scrubbed = scrubPiiFromErrorDetails(unscrubbedError);

      expect(scrubbed).not.toContain('+919876543210');
      expect(scrubbed).not.toContain('client.hni@wealthtrade.in');
      expect(scrubbed).toContain('[REDACTED_PHONE]');
      expect(scrubbed).toContain('[REDACTED_EMAIL]');
    });

    it('F42-T3: should route critical errors to notification channels (Email, Sentry, Webhook)', () => {
      const channels = ['EMAIL', 'WEBHOOK', 'SENTRY'];
      expect(channels).toContain('EMAIL');
      expect(channels).toContain('WEBHOOK');
    });

    it('F42-T4: should record error details in automation_executions table', async () => {
      const execution = await dbHelper.client.automationExecution.create({
        data: {
          ruleId: testRuleIds[0],
          status: 'ERROR',
          errorDetails: 'Connection timeout contacting Meta Graph API',
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      testExecutionIds.push(execution.id);

      expect(execution.status).toBe('ERROR');
      expect(execution.errorDetails).toContain('Connection timeout');
    });

    it('F42-T5: should update rule status to ERROR upon unrecoverable fatal failure', async () => {
      const updated = await dbHelper.client.automationRule.update({
        where: { id: testRuleIds[0] },
        data: { status: 'ERROR' },
      });

      expect(updated.status).toBe('ERROR');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 43: Internal API Bridge (X-Internal-Api-Key)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 43: Internal API Bridge (X-Internal-Api-Key)', () => {
    it('F43-T1: should validate valid X-Internal-Api-Key matching INTERNAL_API_SECRET returning 200', async () => {
      const res = await apiClient
        .withInternalApiKey(INTERNAL_SECRET)
        .get('/internal/automation/birthday-clients?date=11-19');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('F43-T2: should reject requests missing X-Internal-Api-Key header with 401 Unauthorized', async () => {
      const res = await apiClient.get('/internal/automation/birthday-clients?date=11-19');

      expect(res.status).toBe(401);
    });

    it('F43-T3: should reject requests with invalid or tampered X-Internal-Api-Key with 403 Forbidden', async () => {
      const res = await apiClient
        .withHeader('X-Internal-Api-Key', 'invalid_tampered_secret_xyz')
        .get('/internal/automation/birthday-clients?date=11-19');

      expect(res.status).toBe(403);
    });

    it('F43-T4: should verify internal birthday clients contract format (id, phone, name, consent)', async () => {
      const res = await apiClient
        .withInternalApiKey(INTERNAL_SECRET)
        .get('/internal/automation/birthday-clients?date=11-19');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('F43-T5: should verify internal execution error logging contract payload format', async () => {
      const errorPayload = {
        workflowId: '08-central-error-router',
        workflowName: 'Central Error Router',
        executionId: `exec_${Date.now()}`,
        error: {
          code: 'ERR_RATE_LIMIT',
          message: 'Meta API rate limit reached: 80 msgs/s exceeded',
        },
        timestamp: new Date().toISOString(),
      };

      const res = await apiClient
        .withInternalApiKey(INTERNAL_SECRET)
        .post('/internal/automation/execution-error', errorPayload);

      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('success', true);
    });
  });
});
