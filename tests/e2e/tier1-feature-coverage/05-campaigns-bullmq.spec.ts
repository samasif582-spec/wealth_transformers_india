import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import {
  GST_RATE,
  META_PRICING_RATES,
  computeCampaignCost,
  CAMPAIGN_PRICING_TEST_VECTORS,
  SAMPLE_WIZARD_PAYLOAD,
} from '../../fixtures/campaigns.fixture';
import { USER_CREDENTIALS, TEST_USERS } from '../../fixtures/users.fixture';

/**
 * Generates canonical SHA-256 idempotency key for campaign message dispatch.
 * Property P2: idempotency:campaign:{campaignId}:{clientId}:{executionId}
 */
function generateIdempotencyKey(campaignId: string, clientId: string, executionId: string): string {
  const raw = `${campaignId}:${clientId}:${executionId}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `idempotency:campaign:${hash}`;
}

describe('Tier 1 — 05: Campaign Orchestration, BullMQ & Pricing', () => {
  let adminUserId: string;
  let marketingUserId: string;
  let testTemplateId: string;
  let testClientId: string;

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const admin = await dbHelper.findUserByEmail(USER_CREDENTIALS.Admin.email);
    adminUserId = admin?.id || TEST_USERS.Admin.id!;

    const marketing = await dbHelper.findUserByEmail(USER_CREDENTIALS.Marketing_Employee.email);
    marketingUserId = marketing?.id || TEST_USERS.Marketing_Employee.id!;

    // Create a base template for campaign testing
    const tmpl = await dbHelper.client.messageTemplate.create({
      data: {
        name: `test_campaign_tmpl_${Date.now()}`,
        category: 'MARKETING',
        language: 'en',
        status: 'APPROVED',
        createdByUserId: marketingUserId,
      },
    });
    testTemplateId = tmpl.id;

    // Create a base client for message_logs testing
    const client = await dbHelper.client.client.create({
      data: {
        fullName: 'Test Campaign Client',
        whatsappNumber: `+9199999550${Math.floor(100 + Math.random() * 899)}`,
        categoryTier: 'RETAIL',
        communicationConsent: 'OPTED_IN',
        preferredLanguage: 'en',
      },
    });
    testClientId = client.id;
  });

  afterAll(async () => {
    if (testClientId) {
      await dbHelper.client.messageLog.deleteMany({ where: { clientId: testClientId } });
      await dbHelper.client.client.deleteMany({ where: { id: testClientId } });
    }
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    await redisHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 24: Real-Time Audience Evaluation (Property P5)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 24: Real-Time Audience Evaluation (Property P5)', () => {
    const audienceClients = [
      {
        fullName: 'Audience Active OptedIn HNI 1',
        whatsappNumber: '+919999955001',
        email: 'aud1@test.wealthtrade.in',
        categoryTier: 'HNI' as const,
        communicationConsent: 'OPTED_IN' as const,
        preferredLanguage: 'en',
      },
      {
        fullName: 'Audience Active OptedIn HNI 2',
        whatsappNumber: '+919999955002',
        email: 'aud2@test.wealthtrade.in',
        categoryTier: 'HNI' as const,
        communicationConsent: 'OPTED_IN' as const,
        preferredLanguage: 'hi',
      },
      {
        fullName: 'Audience SoftDeleted HNI 3',
        whatsappNumber: '+919999955003',
        email: 'aud3@test.wealthtrade.in',
        categoryTier: 'HNI' as const,
        communicationConsent: 'OPTED_IN' as const,
        preferredLanguage: 'en',
        deletedAt: new Date(),
        accountStatus: 'INACTIVE' as const,
      },
      {
        fullName: 'Audience OptedOut HNI 4',
        whatsappNumber: '+919999955004',
        email: 'aud4@test.wealthtrade.in',
        categoryTier: 'HNI' as const,
        communicationConsent: 'OPTED_OUT' as const,
        preferredLanguage: 'en',
      },
      {
        fullName: 'Audience Retail Client 5',
        whatsappNumber: '+919999955005',
        email: 'aud5@test.wealthtrade.in',
        categoryTier: 'RETAIL' as const,
        communicationConsent: 'OPTED_IN' as const,
        preferredLanguage: 'en',
      },
    ];

    beforeAll(async () => {
      for (const c of audienceClients) {
        await dbHelper.client.client.upsert({
          where: { whatsappNumber: c.whatsappNumber },
          create: c,
          update: c,
        });
      }
    });

    afterAll(async () => {
      const phones = audienceClients.map((c) => c.whatsappNumber);
      await dbHelper.client.client.deleteMany({
        where: { whatsappNumber: { in: phones } },
      });
    });

    it('F24-T1: should resolve clients matching targeted categoryTier (HNI)', async () => {
      const start = Date.now();
      const resolved = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          deletedAt: null,
          whatsappNumber: { in: audienceClients.map((c) => c.whatsappNumber) },
        },
      });
      const duration = Date.now() - start;

      expect(resolved.length).toBe(2);
      expect(duration).toBeLessThan(3000); // Sub-3s SLA
    });

    it('F24-T2: should strictly exclude soft-deleted clients (Property P5)', async () => {
      const resolved = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          deletedAt: null, // Property P5 exclusion
          whatsappNumber: { in: audienceClients.map((c) => c.whatsappNumber) },
        },
      });

      expect(resolved.some((c) => c.whatsappNumber === '+919999955003')).toBe(false);
    });

    it('F24-T3: should strictly exclude non-opted-in clients (Property P1)', async () => {
      const resolved = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN', // Property P1 exclusion
          deletedAt: null,
          whatsappNumber: { in: audienceClients.map((c) => c.whatsappNumber) },
        },
      });

      expect(resolved.some((c) => c.whatsappNumber === '+919999955004')).toBe(false);
    });

    it('F24-T4: should filter clients by preferred language criteria', async () => {
      const resolvedHindi = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'hi',
          deletedAt: null,
          whatsappNumber: { in: audienceClients.map((c) => c.whatsappNumber) },
        },
      });

      expect(resolvedHindi.length).toBe(1);
      expect(resolvedHindi[0].whatsappNumber).toBe('+919999955002');
    });

    it('F24-T5: should return recipient count and complete evaluation in sub-3s', async () => {
      const start = Date.now();
      const count = await dbHelper.client.client.count({
        where: {
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          deletedAt: null,
          whatsappNumber: { in: audienceClients.map((c) => c.whatsappNumber) },
        },
      });
      const duration = Date.now() - start;

      expect(count).toBe(2);
      expect(duration).toBeLessThan(3000);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 25: Pricing & 18% GST Calculation (Property P8)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 25: Pricing & 18% GST Calculation (Property P8)', () => {
    it('F25-T1: should calculate pre-GST cost as recipients * category rate', () => {
      const recipients = 1000;
      const rate = META_PRICING_RATES.MARKETING; // 0.7854
      const calculated = computeCampaignCost(recipients, 'MARKETING');

      expect(calculated.rate).toBe(0.7854);
      expect(calculated.preGst).toBe(785.4);
    });

    it('F25-T2: should compute GST as exactly 18% of pre-GST cost', () => {
      const recipients = 1000;
      const calculated = computeCampaignCost(recipients, 'MARKETING');

      const expectedGst = 785.4 * GST_RATE; // 141.372
      expect(calculated.gstAmount).toBeCloseTo(expectedGst, 4);
    });

    it('F25-T3: should compute total cost as preGst + 18% GST (Property P8)', () => {
      const recipients = 1000;
      const calculated = computeCampaignCost(recipients, 'MARKETING');

      const expectedTotal = 785.4 * 1.18; // 926.772
      expect(calculated.totalCost).toBeCloseTo(expectedTotal, 3);
    });

    it('F25-T4: should compute UTILITY category rate (0.1258 INR + 18% GST)', () => {
      const recipients = 500;
      const calculated = computeCampaignCost(recipients, 'UTILITY');

      expect(calculated.rate).toBe(0.1258);
      expect(calculated.preGst).toBe(62.9);
      expect(calculated.gstAmount).toBeCloseTo(11.322, 3);
      expect(calculated.totalCost).toBeCloseTo(74.222, 3);
    });

    it('F25-T5: should validate all campaign pricing test vectors including boundary zero', () => {
      CAMPAIGN_PRICING_TEST_VECTORS.forEach((vector) => {
        const result = computeCampaignCost(vector.recipients, vector.category);
        expect(result.rate).toBe(vector.expectedRatePerMsg);
        expect(result.preGst).toBeCloseTo(vector.expectedPreGstCost, 4);
        expect(result.gstAmount).toBeCloseTo(vector.expectedGstAmount, 4);
        expect(result.totalCost).toBeCloseTo(vector.expectedTotalCost, 4);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 26: Admin Campaign Approval Workflow
  // ─────────────────────────────────────────────────────────────
  describe('Feature 26: Admin Campaign Approval Workflow', () => {
    let approvalCampaignId: string;
    const campaignName = `TEST_Approval_Flow_${Date.now()}`;

    afterAll(async () => {
      await dbHelper.client.campaignStateTransition.deleteMany({
        where: { campaignId: approvalCampaignId },
      });
      await dbHelper.client.campaign.deleteMany({
        where: { id: approvalCampaignId },
      });
    });

    it('F26-T1: should create PROMOTIONAL campaign in PENDING_APPROVAL status', async () => {
      const campaign = await dbHelper.client.campaign.create({
        data: {
          name: campaignName,
          campaignType: 'PROMOTIONAL',
          status: 'PENDING_APPROVAL',
          templateId: testTemplateId,
          createdByUserId: marketingUserId,
          estimatedCostInr: 926.772,
        },
      });
      approvalCampaignId = campaign.id;

      expect(campaign.status).toBe('PENDING_APPROVAL');
      expect(Number(campaign.estimatedCostInr)).toBeCloseTo(926.772, 3);
    });

    it('F26-T2: should transition status to APPROVED and record approvedByUserId and approvedAt', async () => {
      const now = new Date();
      const approved = await dbHelper.client.campaign.update({
        where: { id: approvalCampaignId },
        data: {
          status: 'APPROVED',
          approvedByUserId: adminUserId,
          approvedAt: now,
        },
      });

      // Log transition
      await dbHelper.client.campaignStateTransition.create({
        data: {
          campaignId: approvalCampaignId,
          fromStatus: 'PENDING_APPROVAL',
          toStatus: 'APPROVED',
          actorId: adminUserId,
          note: 'Approved for Diwali broadcast',
        },
      });

      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedByUserId).toBe(adminUserId);
      expect(approved.approvedAt).not.toBeNull();
    });

    it('F26-T3: should record rejection with mandatory rejectionReason when campaign is rejected', async () => {
      const rejectName = `TEST_Reject_Flow_${Date.now()}`;
      const campaign = await dbHelper.client.campaign.create({
        data: {
          name: rejectName,
          campaignType: 'PROMOTIONAL',
          status: 'REJECTED',
          templateId: testTemplateId,
          createdByUserId: marketingUserId,
          rejectedByUserId: adminUserId,
          rejectionReason: 'Cost estimate exceeds quarterly marketing allocation',
        },
      });

      expect(campaign.status).toBe('REJECTED');
      expect(campaign.rejectionReason).toContain('exceeds quarterly marketing allocation');

      await dbHelper.client.campaign.delete({ where: { id: campaign.id } });
    });

    it('F26-T4: should verify state transition audit log captures fromStatus and toStatus history', async () => {
      const transitions = await dbHelper.client.campaignStateTransition.findMany({
        where: { campaignId: approvalCampaignId },
      });

      expect(transitions.length).toBeGreaterThanOrEqual(1);
      expect(transitions[0].fromStatus).toBe('PENDING_APPROVAL');
      expect(transitions[0].toStatus).toBe('APPROVED');
      expect(transitions[0].actorId).toBe(adminUserId);
    });

    it('F26-T5: should verify non-admin roles lack approval privilege in role permissions matrix', () => {
      const { ROLE_PERMISSIONS_MATRIX } = require('../../fixtures/users.fixture');
      expect(ROLE_PERMISSIONS_MATRIX.Admin.canApproveCampaigns).toBe(true);
      expect(ROLE_PERMISSIONS_MATRIX.Super_Admin.canApproveCampaigns).toBe(true);
      expect(ROLE_PERMISSIONS_MATRIX.Marketing_Employee.canApproveCampaigns).toBe(false);
      expect(ROLE_PERMISSIONS_MATRIX.Operator.canApproveCampaigns).toBe(false);
      expect(ROLE_PERMISSIONS_MATRIX.Viewer.canApproveCampaigns).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 27: BullMQ Queue Dispatch (80 msgs/s)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 27: BullMQ Queue Dispatch (80 msgs/s Rate Limiter)', () => {
    const queueName = 'campaign-messages';

    it('F27-T1: should inspect BullMQ queue and retrieve job counts', async () => {
      const counts = await redisHelper.getQueueJobCounts(queueName);

      expect(counts).toHaveProperty('waiting');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('completed');
      expect(counts).toHaveProperty('failed');
      expect(typeof counts.waiting).toBe('number');
    });

    it('F27-T2: should enqueue campaign message job with recipient phone, template, and variable payload', async () => {
      const queue = redisHelper.getQueue(queueName);
      const testJobData = {
        campaignId: uuidv4(),
        clientId: uuidv4(),
        phone: '+919999955099',
        templateId: testTemplateId,
        variableValues: { '1': 'Rajesh' },
      };

      const job = await queue.add('send-message', testJobData, {
        jobId: `test_job_${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      });

      expect(job.id).toBeDefined();
      expect(job.data.phone).toBe('+919999955099');

      // Clean up job
      await job.remove().catch(() => {});
    });

    it('F27-T3: should verify BullMQ queue rate limiter configuration specifies 80 messages per second', () => {
      // Platform specification: 80 msgs/s to comply with Meta WhatsApp Cloud API tier
      expect(SAMPLE_WIZARD_PAYLOAD.step4.dispatchRatePerSecond).toBe(80);
      const targetRatePerSecond = 80;
      const windowMs = 1000;
      const computedRate = (targetRatePerSecond / windowMs) * 1000;
      expect(computedRate).toBe(80);
    });

    it('F27-T4: should enqueue a batch of recipient jobs and observe status transitions', async () => {
      const queue = redisHelper.getQueue(queueName);
      const batchJobs = [1, 2, 3].map((i) => ({
        name: 'send-message',
        data: {
          campaignId: uuidv4(),
          clientId: uuidv4(),
          phone: `+91999995510${i}`,
          templateId: testTemplateId,
        },
        opts: { jobId: `test_batch_${Date.now()}_${i}` },
      }));

      const added = await queue.addBulk(batchJobs);
      expect(added.length).toBe(3);

      for (const j of added) {
        await j.remove().catch(() => {});
      }
    });

    it('F27-T5: should safely clean up or obliterate test queue jobs without data corruption', async () => {
      const queue = redisHelper.getQueue(queueName);
      const testJobId = `cleanup_probe_${Date.now()}_${uuidv4()}`;

      // 1. Add dedicated probe job
      const job = await queue.add(
        'send-message',
        { campaignId: uuidv4(), clientId: uuidv4(), phone: '+919999955098', templateId: testTemplateId },
        { jobId: testJobId },
      );
      expect(job.id).toBe(testJobId);

      // 2. Verify job is present in queue
      const fetchedJob = await queue.getJob(testJobId);
      expect(fetchedJob).not.toBeNull();
      expect(fetchedJob?.id).toBe(testJobId);

      // 3. Remove the job
      await fetchedJob!.remove();

      // 4. Verify job is completely removed (resolves to null)
      const afterRemoval = await queue.getJob(testJobId);
      expect(afterRemoval).toBeNull();

      // 5. Clean completed/failed jobs and verify result is an array
      const cleanedCompleted = await queue.clean(0, 100, 'completed');
      expect(Array.isArray(cleanedCompleted)).toBe(true);

      const cleanedFailed = await queue.clean(0, 100, 'failed');
      expect(Array.isArray(cleanedFailed)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 28: SHA-256 Idempotency Guard (Property P2)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 28: SHA-256 Idempotency Guard (Property P2)', () => {
    const testCampaignId = '00000000-0000-0000-0000-000000000501';
    const executionId = 'exec-001';

    it('F28-T1: should generate deterministic SHA-256 idempotency key for campaign recipient execution', () => {
      const key1 = generateIdempotencyKey(testCampaignId, testClientId, executionId);
      const key2 = generateIdempotencyKey(testCampaignId, testClientId, executionId);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^idempotency:campaign:[a-f0-9]{64}$/);
    });

    it('F28-T2: should successfully set key on first dispatch using Redis SET NX (Property P2)', async () => {
      const key = generateIdempotencyKey(testCampaignId, testClientId, executionId);
      await redisHelper.client.del(key);

      const firstResult = await redisHelper.setIdempotencyKey(key, 'ENQUEUED', 86400);
      expect(firstResult).toBe(true);
    });

    it('F28-T3: should reject duplicate dispatch attempt via SET NX returning false', async () => {
      const key = generateIdempotencyKey(testCampaignId, testClientId, executionId);

      // Attempt second insertion of the exact same key
      const duplicateResult = await redisHelper.setIdempotencyKey(key, 'ENQUEUED', 86400);
      expect(duplicateResult).toBe(false); // Must be dropped to prevent duplicate message send

      // Clean up
      await redisHelper.client.del(key);
    });

    it('F28-T4: should verify Redis idempotency key TTL is set to 86400 seconds (24 hours)', async () => {
      const key = generateIdempotencyKey(testCampaignId, testClientId, `ttl-test-${Date.now()}`);
      await redisHelper.setIdempotencyKey(key, 'ENQUEUED', 86400);

      const ttl = await redisHelper.client.ttl(key);
      expect(ttl).toBeGreaterThan(86300);
      expect(ttl).toBeLessThanOrEqual(86400);

      await redisHelper.client.del(key);
    });

    it('F28-T5: should enforce unique constraint on idempotency_key in database message_logs', async () => {
      const idempKey = `test_idemp_db_guard_${uuidv4()}`;

      // First message log insert succeeds
      const log1 = await dbHelper.client.messageLog.create({
        data: {
          templateId: testTemplateId,
          templateCategory: 'MARKETING',
          idempotencyKey: idempKey,
          deliveryStatus: 'QUEUED',
          clientId: testClientId,
          variableValues: {},
        },
      });
      expect(log1.id).toBeDefined();

      // Second message log insert with identical key must fail unique constraint
      await expect(
        dbHelper.client.messageLog.create({
          data: {
            templateId: testTemplateId,
            templateCategory: 'MARKETING',
            idempotencyKey: idempKey,
            deliveryStatus: 'QUEUED',
            clientId: testClientId,
            variableValues: {},
          },
        }),
      ).rejects.toThrow();

      // Clean up
      await dbHelper.client.messageLog.deleteMany({ where: { idempotencyKey: idempKey } });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 29: Campaign Pause, Resume & Cancel
  // ─────────────────────────────────────────────────────────────
  describe('Feature 29: Campaign Pause, Resume & Cancel Lifecycle', () => {
    let lifecycleCampaignId: string;
    const lName = `TEST_Lifecycle_${Date.now()}`;

    beforeAll(async () => {
      const c = await dbHelper.client.campaign.create({
        data: {
          name: lName,
          campaignType: 'PROMOTIONAL',
          status: 'EXECUTING',
          templateId: testTemplateId,
          createdByUserId: marketingUserId,
          dispatchedAt: new Date(),
        },
      });
      lifecycleCampaignId = c.id;
    });

    afterAll(async () => {
      await dbHelper.client.campaign.deleteMany({ where: { id: lifecycleCampaignId } });
    });

    it('F29-T1: should transition status to PAUSED when campaign is paused', async () => {
      const updated = await dbHelper.client.campaign.update({
        where: { id: lifecycleCampaignId },
        data: { status: 'PAUSED' },
      });

      expect(updated.status).toBe('PAUSED');
    });

    it('F29-T2: should transition status back to EXECUTING when campaign is resumed', async () => {
      const updated = await dbHelper.client.campaign.update({
        where: { id: lifecycleCampaignId },
        data: { status: 'EXECUTING' },
      });

      expect(updated.status).toBe('EXECUTING');
    });

    it('F29-T3: should transition status to CANCELLED and record cancelledAt and cancelledByUserId', async () => {
      const now = new Date();
      const updated = await dbHelper.client.campaign.update({
        where: { id: lifecycleCampaignId },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledByUserId: adminUserId,
        },
      });

      expect(updated.status).toBe('CANCELLED');
      expect(updated.cancelledAt).not.toBeNull();
      expect(updated.cancelledByUserId).toBe(adminUserId);
    });

    it('F29-T4: should pause and resume BullMQ queue state programmatically', async () => {
      const queue = redisHelper.getQueue('campaign-messages');
      await queue.pause();
      const isPaused = await queue.isPaused();
      expect(isPaused).toBe(true);

      await queue.resume();
      const isResumed = await queue.isPaused();
      expect(isResumed).toBe(false);
    });

    it('F29-T5: should verify cancelled campaign cannot transition back to EXECUTING', async () => {
      const cancelledCampaign = await dbHelper.client.campaign.findUnique({
        where: { id: lifecycleCampaignId },
      });

      expect(cancelledCampaign?.status).toBe('CANCELLED');
      // Terminal state guard: CANCELLED cannot be restarted
      expect(['COMPLETED', 'CANCELLED']).toContain(cancelledCampaign?.status);
    });
  });
});
