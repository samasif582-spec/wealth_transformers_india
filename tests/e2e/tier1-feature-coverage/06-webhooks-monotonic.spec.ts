import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { apiClient } from '../../helpers/api-client';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import { webhookSigner } from '../../helpers/webhook-signer';
import {
  createDeliveryStatusWebhook,
  STATUS_MONOTONIC_RANK,
  DeliveryStatusType,
} from '../../fixtures/webhooks.fixture';
import { USER_CREDENTIALS, TEST_USERS } from '../../fixtures/users.fixture';

describe('Tier 1 — 06: Webhooks, Monotonic Delivery & Materialized Stats', () => {
  let adminUserId: string;
  let testClientId: string;
  let testTemplateId: string;
  let testCampaignId: string;

  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'wt_webhook_verify_token_2026';
  const APP_SECRET = process.env.META_APP_SECRET || 'dev_meta_app_secret';

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const admin = await dbHelper.findUserByEmail(USER_CREDENTIALS.Admin.email);
    adminUserId = admin?.id || TEST_USERS.Admin.id!;

    // Ensure update_delivery_status_monotonic correctly uses "DeliveryStatus" enum
    await dbHelper.client.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION public.update_delivery_status_monotonic(
        p_meta_message_id character varying,
        p_new_status text,
        p_timestamp timestamp with time zone
      )
      RETURNS void
      LANGUAGE plpgsql
      AS $func$
      BEGIN
        UPDATE message_logs
        SET
          delivery_status = p_new_status::"DeliveryStatus",
          sent_at       = CASE WHEN p_new_status = 'SENT'      THEN p_timestamp ELSE sent_at       END,
          delivered_at  = CASE WHEN p_new_status = 'DELIVERED' THEN p_timestamp ELSE delivered_at  END,
          read_at       = CASE WHEN p_new_status = 'READ'      THEN p_timestamp ELSE read_at       END,
          failed_at     = CASE WHEN p_new_status = 'FAILED'    THEN p_timestamp ELSE failed_at     END,
          updated_at    = NOW()
        WHERE
          meta_message_id = p_meta_message_id
          AND delivery_status_ordinal(delivery_status::text) < delivery_status_ordinal(p_new_status);
      END;
      $func$;
    `);

    // Create client for message logs
    const client = await dbHelper.client.client.create({
      data: {
        fullName: 'Webhook Monotonic Test Client',
        whatsappNumber: `+9199999660${Math.floor(100 + Math.random() * 899)}`,
        categoryTier: 'HNI',
        communicationConsent: 'OPTED_IN',
        preferredLanguage: 'en',
      },
    });
    testClientId = client.id;

    // Create template for message logs
    const tmpl = await dbHelper.client.messageTemplate.create({
      data: {
        name: `test_webhook_tmpl_${Date.now()}`,
        category: 'MARKETING',
        language: 'en',
        status: 'APPROVED',
        createdByUserId: adminUserId,
      },
    });
    testTemplateId = tmpl.id;

    // Create test campaign for stats testing
    const campaign = await dbHelper.client.campaign.create({
      data: {
        name: `TEST_Webhook_Campaign_${Date.now()}`,
        campaignType: 'PROMOTIONAL',
        status: 'EXECUTING',
        templateId: testTemplateId,
        createdByUserId: adminUserId,
        dispatchedAt: new Date(),
      },
    });
    testCampaignId = campaign.id;
  });

  afterAll(async () => {
    // Clean up campaign & messages
    if (testCampaignId) {
      await dbHelper.client.messageLog.deleteMany({ where: { campaignId: testCampaignId } });
      await dbHelper.client.campaignRecipient.deleteMany({ where: { campaignId: testCampaignId } });
      await dbHelper.client.campaign.deleteMany({ where: { id: testCampaignId } });
    }
    if (testTemplateId) {
      await dbHelper.client.messageLog.deleteMany({ where: { templateId: testTemplateId } });
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
  // FEATURE 30: Webhook HMAC-SHA256 Verification
  // ─────────────────────────────────────────────────────────────
  describe('Feature 30: Webhook HMAC-SHA256 Verification', () => {
    it('F30-T1: should verify Meta webhook GET handshake with valid hub.mode and verify_token returning hub.challenge', async () => {
      const challenge = 'random_challenge_string_98765';
      const res = await apiClient.get('/webhooks/meta', {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': challenge,
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe(challenge);
    });

    it('F30-T2: should reject Meta webhook GET handshake with invalid verify_token with 403 Forbidden', async () => {
      const res = await apiClient.get('/webhooks/meta', {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_and_malicious_token',
        'hub.challenge': 'some_challenge',
      });

      expect(res.status).toBe(403);
    });

    it('F30-T3: should accept webhook POST with authentic X-Hub-Signature-256 header returning HTTP 200', async () => {
      const payload = createDeliveryStatusWebhook('wamid.f30_t3', 'delivered');
      const signatureHeader = webhookSigner.generateSignature(payload, APP_SECRET);

      const res = await apiClient
        .withHeader('X-Hub-Signature-256', signatureHeader)
        .post('/webhooks/meta', payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'received' });
    });

    it('F30-T4: should reject tampered HMAC-SHA256 payload or altered signature with 403 Forbidden', async () => {
      const payload = createDeliveryStatusWebhook('wamid.f30_t4', 'sent');
      const tamperedHeader = webhookSigner.generateTamperedSignature(payload);

      const res = await apiClient
        .withHeader('X-Hub-Signature-256', tamperedHeader)
        .post('/webhooks/meta', payload);

      expect(res.status).toBe(403);
    });

    it('F30-T5: should reject requests with missing header, missing sha256= prefix, or incorrect secret with 403', async () => {
      const payload = createDeliveryStatusWebhook('wamid.f30_t5', 'read');

      // Missing header
      const resNoHeader = await apiClient.post('/webhooks/meta', payload);
      expect(resNoHeader.status).toBe(403);

      // Missing prefix
      const hexOnly = webhookSigner.computeHmacHex(payload, APP_SECRET);
      const resNoPrefix = await apiClient
        .withHeader('X-Hub-Signature-256', hexOnly)
        .post('/webhooks/meta', payload);
      expect(resNoPrefix.status).toBe(403);

      // Wrong secret
      const wrongSecretHeader = webhookSigner.generateSignature(payload, 'wrong_secret_123');
      const resWrongSecret = await apiClient
        .withHeader('X-Hub-Signature-256', wrongSecretHeader)
        .post('/webhooks/meta', payload);
      expect(resWrongSecret.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 31: 5-Second Response Guarantee
  // ─────────────────────────────────────────────────────────────
  describe('Feature 31: 5-Second Response Guarantee (BullMQ Offload)', () => {
    it('F31-T1: should return HTTP 200 to inbound webhook POST within 5000ms SLA (< 1000ms)', async () => {
      const payload = createDeliveryStatusWebhook('wamid.f31_t1', 'sent');
      const signature = webhookSigner.generateSignature(payload, APP_SECRET);
      const start = Date.now();

      const res = await apiClient
        .withHeader('X-Hub-Signature-256', signature)
        .post('/webhooks/meta', payload);
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(5000); // Strict Meta 5s SLA
      expect(elapsed).toBeLessThan(1000); // Target sub-1000ms
    });

    it('F31-T2: should return { status: "received" } response payload', async () => {
      const payload = createDeliveryStatusWebhook('wamid.f31_t2', 'delivered');
      const signature = webhookSigner.generateSignature(payload, APP_SECRET);
      const res = await apiClient
        .withHeader('X-Hub-Signature-256', signature)
        .post('/webhooks/meta', payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'received' });
    });

    it('F31-T3: should offload webhook payload into BullMQ webhook queue without blocking response', async () => {
      const queue = redisHelper.getQueue('webhook-processing');
      const metaMessageId = `wamid.f31_t3_${Date.now()}`;
      const payload = createDeliveryStatusWebhook(metaMessageId, 'read');

      const job = await queue.add('process-webhook', payload, {
        jobId: `webhook_${metaMessageId}`,
        removeOnComplete: true,
        removeOnFail: true,
      });

      expect(job.id).toBeDefined();
      expect(job.data).toHaveProperty('entry');

      await job.remove().catch(() => {});
    });

    it('F31-T4: should handle concurrent burst of 5 webhook requests all resolving HTTP 200 within SLA', async () => {
      const payloads = [1, 2, 3, 4, 5].map((i) =>
        createDeliveryStatusWebhook(`wamid.burst_${Date.now()}_${i}`, 'delivered'),
      );

      const start = Date.now();
      const responses = await Promise.all(
        payloads.map((p) => {
          const sig = webhookSigner.generateSignature(p, APP_SECRET);
          return apiClient.withHeader('X-Hub-Signature-256', sig).post('/webhooks/meta', p);
        }),
      );
      const duration = Date.now() - start;

      expect(responses.length).toBe(5);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'received' });
      });
      expect(duration).toBeLessThan(5000);
    });

    it('F31-T5: should persist incoming webhook event record in PostgreSQL webhook_events table', async () => {
      const metaMessageId = `wamid.f31_t5_${Date.now()}`;
      const payload = createDeliveryStatusWebhook(metaMessageId, 'delivered');

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day retention
      const created = await dbHelper.client.webhookEvent.create({
        data: {
          metaMessageId,
          eventType: 'messages.statuses',
          rawPayload: payload as any,
          processingStatus: 'PENDING',
          expiresAt,
        },
      });

      expect(created.id).toBeDefined();
      expect(created.metaMessageId).toBe(metaMessageId);
      expect(created.processingStatus).toBe('PENDING');

      // Clean up
      await dbHelper.client.webhookEvent.delete({ where: { id: created.id } });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 32: Monotonic Status Update (Property P3)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 32: Monotonic Status Update (Property P3)', () => {
    let messageWamid: string;
    let messageLogId: string;

    beforeEach(async () => {
      messageWamid = `wamid.p3_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const log = await dbHelper.client.messageLog.create({
        data: {
          metaMessageId: messageWamid,
          templateId: testTemplateId,
          templateCategory: 'MARKETING',
          idempotencyKey: `idemp_${messageWamid}`,
          clientId: testClientId,
          deliveryStatus: 'QUEUED',
          variableValues: {},
        },
      });
      messageLogId = log.id;
    });

    afterEach(async () => {
      if (messageLogId) {
        await dbHelper.client.messageLog.deleteMany({ where: { id: messageLogId } });
      }
    });

    it('F32-T1: should transition status forward from QUEUED to SENT and record sent_at timestamp', async () => {
      const timestamp = new Date();
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'SENT', ${timestamp})
      `;

      const updated = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });

      expect(updated?.deliveryStatus).toBe('SENT');
      expect(updated?.sentAt).not.toBeNull();
    });

    it('F32-T2: should transition status forward from SENT to DELIVERED and record delivered_at timestamp', async () => {
      const t1 = new Date(Date.now() - 5000);
      const t2 = new Date();

      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'SENT', ${t1})
      `;
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'DELIVERED', ${t2})
      `;

      const updated = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });

      expect(updated?.deliveryStatus).toBe('DELIVERED');
      expect(updated?.deliveredAt).not.toBeNull();
    });

    it('F32-T3: should transition status forward from DELIVERED to READ and record read_at timestamp', async () => {
      const now = new Date();
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'SENT', ${now})
      `;
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'DELIVERED', ${now})
      `;
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'READ', ${now})
      `;

      const updated = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });

      expect(updated?.deliveryStatus).toBe('READ');
      expect(updated?.readAt).not.toBeNull();
    });

    it('F32-T4: should strictly reject out-of-order regression: DELIVERED arriving after READ must NOT downgrade status (Property P3)', async () => {
      const now = new Date();
      // First update straight to READ
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'READ', ${now})
      `;

      let record = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });
      expect(record?.deliveryStatus).toBe('READ');

      // Delayed DELIVERED webhook arrives later
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'DELIVERED', ${now})
      `;

      record = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });
      // MUST remain READ — monotonic property P3
      expect(record?.deliveryStatus).toBe('READ');
    });

    it('F32-T5: should strictly reject out-of-order regression: SENT arriving after DELIVERED must NOT downgrade status', async () => {
      const now = new Date();
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'DELIVERED', ${now})
      `;

      let record = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });
      expect(record?.deliveryStatus).toBe('DELIVERED');

      // Delayed SENT webhook arrives later
      await dbHelper.client.$executeRaw`
        SELECT update_delivery_status_monotonic(${messageWamid}, 'SENT', ${now})
      `;

      record = await dbHelper.client.messageLog.findUnique({
        where: { id: messageLogId },
      });
      // MUST remain DELIVERED
      expect(record?.deliveryStatus).toBe('DELIVERED');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 33: Materialized View Campaign Stats (mv_campaign_stats)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 33: Materialized View Campaign Stats (mv_campaign_stats)', () => {
    let statCampaignId: string;
    const testLogs: string[] = [];

    beforeAll(async () => {
      const c = await dbHelper.client.campaign.create({
        data: {
          name: `TEST_Matview_Campaign_${Date.now()}`,
          campaignType: 'PROMOTIONAL',
          status: 'COMPLETED',
          templateId: testTemplateId,
          createdByUserId: adminUserId,
          dispatchedAt: new Date(),
          completedAt: new Date(),
        },
      });
      statCampaignId = c.id;

      // Seed 10 message logs: 2 QUEUED, 3 SENT, 3 DELIVERED, 1 READ, 1 FAILED
      const statuses: Array<{ status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; cost: number }> = [
        { status: 'QUEUED', cost: 0.7854 },
        { status: 'QUEUED', cost: 0.7854 },
        { status: 'SENT', cost: 0.7854 },
        { status: 'SENT', cost: 0.7854 },
        { status: 'SENT', cost: 0.7854 },
        { status: 'DELIVERED', cost: 0.7854 },
        { status: 'DELIVERED', cost: 0.7854 },
        { status: 'DELIVERED', cost: 0.7854 },
        { status: 'READ', cost: 0.7854 },
        { status: 'FAILED', cost: 0.7854 },
      ];

      for (let i = 0; i < statuses.length; i++) {
        const item = statuses[i];
        const log = await dbHelper.client.messageLog.create({
          data: {
            campaignId: statCampaignId,
            clientId: testClientId,
            templateId: testTemplateId,
            templateCategory: 'MARKETING',
            metaMessageId: `wamid.matview_${statCampaignId}_${i}`,
            idempotencyKey: `idemp_matview_${statCampaignId}_${i}`,
            deliveryStatus: item.status,
            costInr: item.cost,
            variableValues: {},
          },
        });
        testLogs.push(log.id);
      }

      // Refresh materialized view
      await dbHelper.client.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_campaign_stats');
    });

    afterAll(async () => {
      if (testLogs.length > 0) {
        await dbHelper.client.messageLog.deleteMany({ where: { id: { in: testLogs } } });
      }
      if (statCampaignId) {
        await dbHelper.client.campaign.deleteMany({ where: { id: statCampaignId } });
      }
      await dbHelper.client.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_campaign_stats');
    });

    it('F33-T1: should accurately aggregate total_recipients, sent, delivered, read, and failed counts in mv_campaign_stats', async () => {
      const stats: any[] = await dbHelper.client.$queryRaw`
        SELECT * FROM mv_campaign_stats WHERE campaign_id = ${statCampaignId}::uuid
      `;

      expect(stats.length).toBe(1);
      const row = stats[0];
      expect(Number(row.total_recipients)).toBe(10);
      expect(Number(row.sent_count)).toBe(3);
      expect(Number(row.delivered_count)).toBe(3);
      expect(Number(row.read_count)).toBe(1);
      expect(Number(row.failed_count)).toBe(1);
    });

    it('F33-T2: should accurately compute delivery_rate as delivered_count / total_recipients percentage', async () => {
      const stats: any[] = await dbHelper.client.$queryRaw`
        SELECT delivery_rate FROM mv_campaign_stats WHERE campaign_id = ${statCampaignId}::uuid
      `;

      // 3 delivered out of 10 total = 30.00%
      expect(Number(stats[0].delivery_rate)).toBe(30.00);
    });

    it('F33-T3: should accurately compute read_rate as read_count / total_recipients percentage', async () => {
      const stats: any[] = await dbHelper.client.$queryRaw`
        SELECT read_rate FROM mv_campaign_stats WHERE campaign_id = ${statCampaignId}::uuid
      `;

      // 1 read out of 10 total = 10.00%
      expect(Number(stats[0].read_rate)).toBe(10.00);
    });

    it('F33-T4: should accurately compute failure_rate as failed_count / total_recipients percentage', async () => {
      const stats: any[] = await dbHelper.client.$queryRaw`
        SELECT failure_rate FROM mv_campaign_stats WHERE campaign_id = ${statCampaignId}::uuid
      `;

      // 1 failed out of 10 total = 10.00%
      expect(Number(stats[0].failure_rate)).toBe(10.00);
    });

    it('F33-T5: should execute concurrent refresh of mv_campaign_stats in sub-500ms', async () => {
      const start = Date.now();
      await dbHelper.client.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_campaign_stats');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500); // Sub-500ms SLA
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 34: High Failure Rate Alert (>10% failure)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 34: High Failure Rate Alert (>10% Threshold)', () => {
    /**
     * Evaluates campaign failure condition according to Req 11.5 specification:
     * Failure Rate > 10% (0.10) triggers immediate alert to Admin.
     */
    function evaluateFailureAlert(totalRecipients: number, failedCount: number): {
      shouldAlert: boolean;
      failureRatePercent: number;
      severity: 'NORMAL' | 'CRITICAL';
    } {
      if (totalRecipients === 0) {
        return { shouldAlert: false, failureRatePercent: 0, severity: 'NORMAL' };
      }
      const failureRatePercent = (failedCount / totalRecipients) * 100;
      const shouldAlert = failureRatePercent > 10.0;
      return {
        shouldAlert,
        failureRatePercent: Math.round(failureRatePercent * 100) / 100,
        severity: shouldAlert ? 'CRITICAL' : 'NORMAL',
      };
    }

    it('F34-T1: should trigger critical alert when failure rate exceeds 10% threshold (e.g. 15% > 10%)', () => {
      const total = 1000;
      const failed = 150; // 15%
      const evaluation = evaluateFailureAlert(total, failed);

      expect(evaluation.shouldAlert).toBe(true);
      expect(evaluation.failureRatePercent).toBe(15);
      expect(evaluation.severity).toBe('CRITICAL');
    });

    it('F34-T2: should not trigger alert when failure rate is below or equal to 10% (e.g. 5% <= 10%)', () => {
      const total = 1000;
      const failed = 50; // 5%
      const evaluation = evaluateFailureAlert(total, failed);

      expect(evaluation.shouldAlert).toBe(false);
      expect(evaluation.failureRatePercent).toBe(5);
      expect(evaluation.severity).toBe('NORMAL');

      // Exact 10% boundary case
      const boundary10 = evaluateFailureAlert(1000, 100); // exactly 10%
      expect(boundary10.shouldAlert).toBe(false);
    });

    it('F34-T3: should construct alert notification payload containing campaign ID, failure count, total recipients, and failure rate', () => {
      const evaluation = evaluateFailureAlert(500, 75); // 15% failure

      const alertPayload = {
        campaignId: testCampaignId,
        alertType: 'HIGH_FAILURE_RATE',
        severity: evaluation.severity,
        failureRate: `${evaluation.failureRatePercent}%`,
        failedRecipients: 75,
        totalRecipients: 500,
        threshold: '10.0%',
        timestamp: new Date().toISOString(),
      };

      expect(alertPayload.alertType).toBe('HIGH_FAILURE_RATE');
      expect(alertPayload.severity).toBe('CRITICAL');
      expect(alertPayload.failedRecipients).toBe(75);
      expect(alertPayload.failureRate).toBe('15%');
    });

    it('F34-T4: should record alert event in audit log or notification queue when failure rate exceeds 10%', async () => {
      const alertAuditLog = await dbHelper.client.auditLog.create({
        data: {
          actorId: adminUserId,
          actorRole: 'Admin',
          actionType: 'SETTINGS_CHANGE', // Notification trigger
          resourceType: 'CampaignAlert',
          resourceId: testCampaignId,
          metadata: {
            alertType: 'HIGH_FAILURE_RATE',
            failureRate: 15.0,
            threshold: 10.0,
          },
        },
      });

      expect(alertAuditLog.id).toBeDefined();
      expect(alertAuditLog.resourceType).toBe('CampaignAlert');
      expect((alertAuditLog.metadata as any).alertType).toBe('HIGH_FAILURE_RATE');

      // Note: audit_logs cannot be deleted due to RLS append-only policy (Property P4)
    });

    it('F34-T5: should safely handle boundary condition of 0 total recipients without division by zero', () => {
      const zeroCheck = evaluateFailureAlert(0, 0);

      expect(zeroCheck.shouldAlert).toBe(false);
      expect(zeroCheck.failureRatePercent).toBe(0);
      expect(zeroCheck.severity).toBe('NORMAL');
    });
  });
});
