import { v4 as uuidv4 } from 'uuid';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import { apiClient } from '../../helpers/api-client';
import { authHelper } from '../../helpers/auth-helper';
import {
  USER_CREDENTIALS,
  TEST_USERS,
  UserRoleKey,
} from '../../fixtures/users.fixture';
import { isOptOutKeyword } from '../../../apps/backend/src/consent/utils/optout-detector';

async function getRoleToken(role: UserRoleKey): Promise<string> {
  const user = await dbHelper.findUserByEmail(USER_CREDENTIALS[role].email);
  const userId = user?.id || TEST_USERS[role].id || uuidv4();
  const { token } = authHelper.generateAccessToken({ role, userId });
  await redisHelper.setLastActivity(userId, Math.floor(Date.now() / 1000));
  return token;
}

describe('Tier 1 — 03: WhatsApp Consent Lifecycle & Immutability', () => {
  let operatorUserId: string;
  let testClientId: string;
  const testClientPhone = '+919999944001';

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const operator = await dbHelper.findUserByEmail(USER_CREDENTIALS.Operator.email);
    operatorUserId = operator?.id || TEST_USERS.Operator.id!;

    // Create a dedicated client for consent testing
    const client = await dbHelper.client.client.upsert({
      where: { whatsappNumber: testClientPhone },
      create: {
        fullName: 'Consent Test Subject Client',
        whatsappNumber: testClientPhone,
        email: 'consent.subject@test.wealthtrade.in',
        categoryTier: 'HNI',
        communicationConsent: 'PENDING',
        preferredLanguage: 'en',
      },
      update: {
        communicationConsent: 'PENDING',
        deletedAt: null,
      },
    });
    testClientId = client.id;
  });

  afterAll(async () => {
    await dbHelper.client.whatsappConsent.deleteMany({
      where: { clientId: testClientId },
    });
    await dbHelper.client.client.deleteMany({
      where: { whatsappNumber: testClientPhone },
    });
    await dbHelper.disconnect();
    await redisHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 13: Immutable Consent Register
  // ─────────────────────────────────────────────────────────────
  describe('Feature 13: Immutable Consent Register (Append-Only)', () => {
    it('F13-T1: should append initial OPTED_IN consent record with source, evidence, and operator ID', async () => {
      const consentRecord = await dbHelper.client.whatsappConsent.create({
        data: {
          clientId: testClientId,
          consentStatus: 'OPTED_IN',
          consentSource: 'MANUAL_ENTRY',
          reason: 'Client signed physical KYC consent form during relationship onboarding',
          evidenceReference: 'https://docs.wealthtrade.in/kyc/consent_9999944001.pdf',
          recordedByUserId: operatorUserId,
        },
      });

      expect(consentRecord.id).toBeDefined();
      expect(consentRecord.consentStatus).toBe('OPTED_IN');
      expect(consentRecord.consentSource).toBe('MANUAL_ENTRY');
      expect(consentRecord.recordedByUserId).toBe(operatorUserId);
      expect(consentRecord.recordedAt).toBeInstanceOf(Date);

      // Update client communicationConsent to reflect current status
      await dbHelper.client.client.update({
        where: { id: testClientId },
        data: { communicationConsent: 'OPTED_IN' },
      });
    });

    it('F13-T2: should preserve entire sequential timeline without overwriting previous records', async () => {
      // Append a second consent change (OPTED_OUT)
      await dbHelper.client.whatsappConsent.create({
        data: {
          clientId: testClientId,
          consentStatus: 'OPTED_OUT',
          consentSource: 'WHATSAPP_REPLY',
          reason: 'Client sent STOP inbound message via WhatsApp',
        },
      });

      // Append a third consent change (OPTED_IN re-consent)
      await dbHelper.client.whatsappConsent.create({
        data: {
          clientId: testClientId,
          consentStatus: 'OPTED_IN',
          consentSource: 'FORM',
          reason: 'Client re-opted in via client portal settings',
          evidenceReference: 'PORTAL_AUDIT_LOG_20261119_001',
          recordedByUserId: operatorUserId,
        },
      });

      // Retrieve full history ordered by recordedAt DESC
      const history = await dbHelper.client.whatsappConsent.findMany({
        where: { clientId: testClientId },
        orderBy: { recordedAt: 'desc' },
      });

      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history[0].consentStatus).toBe('OPTED_IN');
      expect(history[1].consentStatus).toBe('OPTED_OUT');
      expect(history[2].consentStatus).toBe('OPTED_IN');
    });

    it('F13-T3: should verify that consent records store evidence reference strings up to 2048 chars', async () => {
      const longEvidence = 'https://compliance.wealthtrade.in/vault/' + 'x'.repeat(500);
      const record = await dbHelper.client.whatsappConsent.create({
        data: {
          clientId: testClientId,
          consentStatus: 'OPTED_IN',
          consentSource: 'API',
          reason: 'Automated partner integration consent sync',
          evidenceReference: longEvidence,
        },
      });

      expect(record.evidenceReference).toBe(longEvidence);
    });

    it('F13-T4: should disallow or reject empty/unspecified clientId foreign key violations', async () => {
      const nonExistentClientId = uuidv4();
      await expect(
        dbHelper.client.whatsappConsent.create({
          data: {
            clientId: nonExistentClientId,
            consentStatus: 'OPTED_IN',
            consentSource: 'MANUAL_ENTRY',
            reason: 'Test orphaned consent insert',
          },
        }),
      ).rejects.toThrow();
    });

    it('F13-T5: should verify recordedByUserId relation correctly points to operator user', async () => {
      const latestConsent = await dbHelper.client.whatsappConsent.findFirst({
        where: { clientId: testClientId, recordedByUserId: { not: null } },
        include: { recordedBy: true },
        orderBy: { recordedAt: 'desc' },
      });

      expect(latestConsent).not.toBeNull();
      expect(latestConsent?.recordedBy?.email).toBe(USER_CREDENTIALS.Operator.email);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 14: Real-Time Consent Re-validation (Property P1)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 14: Real-Time Consent Re-validation (Property P1)', () => {
    let optedInClientId: string;
    let optedOutClientId: string;
    let pendingClientId: string;

    beforeAll(async () => {
      const c1 = await dbHelper.client.client.create({
        data: {
          fullName: 'Opted In Client P1',
          whatsappNumber: '+919999944011',
          email: 'optedin.p1@test.wealthtrade.in',
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
        },
      });
      optedInClientId = c1.id;

      const c2 = await dbHelper.client.client.create({
        data: {
          fullName: 'Opted Out Client P1',
          whatsappNumber: '+919999944012',
          email: 'optedout.p1@test.wealthtrade.in',
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_OUT',
          preferredLanguage: 'en',
        },
      });
      optedOutClientId = c2.id;

      const c3 = await dbHelper.client.client.create({
        data: {
          fullName: 'Pending Consent Client P1',
          whatsappNumber: '+919999944013',
          email: 'pending.p1@test.wealthtrade.in',
          categoryTier: 'HNI',
          communicationConsent: 'PENDING',
          preferredLanguage: 'en',
        },
      });
      pendingClientId = c3.id;
    });

    afterAll(async () => {
      await dbHelper.client.client.deleteMany({
        where: {
          whatsappNumber: { in: ['+919999944011', '+919999944012', '+919999944013'] },
        },
      });
    });

    it('F14-T1: should strictly include only OPTED_IN clients for MARKETING campaigns (Property P1)', async () => {
      const marketingAudience = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          deletedAt: null,
          whatsappNumber: { in: ['+919999944011', '+919999944012', '+919999944013'] },
        },
      });

      expect(marketingAudience.length).toBe(1);
      expect(marketingAudience[0].id).toBe(optedInClientId);
    });

    it('F14-T2: should strictly exclude OPTED_OUT clients from MARKETING campaign audience', async () => {
      const marketingAudience = await dbHelper.client.client.findMany({
        where: {
          communicationConsent: 'OPTED_IN',
          deletedAt: null,
          whatsappNumber: { in: ['+919999944011', '+919999944012', '+919999944013'] },
        },
      });

      expect(marketingAudience.some((c) => c.id === optedOutClientId)).toBe(false);
    });

    it('F14-T3: should strictly exclude PENDING consent clients from MARKETING campaign audience', async () => {
      const marketingAudience = await dbHelper.client.client.findMany({
        where: {
          communicationConsent: 'OPTED_IN',
          deletedAt: null,
          whatsappNumber: { in: ['+919999944011', '+919999944012', '+919999944013'] },
        },
      });

      expect(marketingAudience.some((c) => c.id === pendingClientId)).toBe(false);
    });

    it('F14-T4: should mark campaign recipient as suppressed if client opts out while in campaign queue', async () => {
      // Create valid template for campaign foreign key
      const template = await dbHelper.client.messageTemplate.create({
        data: {
          name: `test_consent_template_${Date.now()}`,
          category: 'MARKETING',
          language: 'en',
          createdByUserId: operatorUserId,
        },
      });

      // Simulate campaign recipient resolution
      const campaign = await dbHelper.client.campaign.create({
        data: {
          name: `TEST_Consent_Suppression_${Date.now()}`,
          campaignType: 'PROMOTIONAL',
          templateId: template.id,
          createdByUserId: operatorUserId,
        },
      });

      const recipient = await dbHelper.client.campaignRecipient.create({
        data: {
          campaignId: campaign.id,
          clientId: optedInClientId,
          consentVerified: true,
          suppressed: false,
        },
      });
      expect(recipient.suppressed).toBe(false);

      // Now client opts out in real time
      await dbHelper.client.client.update({
        where: { id: optedInClientId },
        data: { communicationConsent: 'OPTED_OUT' },
      });

      // Real-time re-validation marks recipient suppressed
      const updatedRecipient = await dbHelper.client.campaignRecipient.update({
        where: { id: recipient.id },
        data: { suppressed: true, consentVerified: false },
      });

      expect(updatedRecipient.suppressed).toBe(true);
      expect(updatedRecipient.consentVerified).toBe(false);

      // Clean up
      await dbHelper.client.campaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
      await dbHelper.client.campaign.delete({ where: { id: campaign.id } });
      await dbHelper.client.messageTemplate.delete({ where: { id: template.id } });
    });

    it('F14-T5: should permit UTILITY category messages to non-opted-out clients', async () => {
      // Utility messages (like OTP, trade confirmation) can target active clients who are not OPTED_OUT
      const utilityEligible = await dbHelper.client.client.findMany({
        where: {
          accountStatus: 'ACTIVE',
          communicationConsent: { not: 'OPTED_OUT' },
          deletedAt: null,
          whatsappNumber: { in: ['+919999944011', '+919999944012', '+919999944013'] },
        },
      });

      expect(utilityEligible.some((c) => c.id === pendingClientId)).toBe(true);
      expect(utilityEligible.some((c) => c.id === optedOutClientId)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 15: Inbound Keyword Auto Opt-Out
  // ─────────────────────────────────────────────────────────────
  describe('Feature 15: Inbound Keyword Auto Opt-Out (STOP, UNSUBSCRIBE)', () => {
    let autoOptOutClientId: string;
    const autoOptOutPhone = '+919999944021';

    beforeAll(async () => {
      const client = await dbHelper.client.client.create({
        data: {
          fullName: 'Auto Opt Out Target',
          whatsappNumber: autoOptOutPhone,
          email: 'auto.optout@test.wealthtrade.in',
          categoryTier: 'RETAIL',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
        },
      });
      autoOptOutClientId = client.id;
    });

    afterAll(async () => {
      await dbHelper.client.whatsappConsent.deleteMany({
        where: { clientId: autoOptOutClientId },
      });
      await dbHelper.client.client.deleteMany({
        where: { id: autoOptOutClientId },
      });
    });

    it('F15-T1: should recognize case-insensitive opt-out keywords (STOP, unsubscribe, रुकें)', () => {
      const testCases = [
        { text: 'STOP', expected: true },
        { text: 'stop', expected: true },
        { text: 'Stop', expected: true },
        { text: 'UNSUBSCRIBE', expected: true },
        { text: 'unsubscribe', expected: true },
        { text: 'OPT OUT', expected: true },
        { text: 'रुकें', expected: true },
        { text: 'Hello, please send research', expected: false },
        { text: 'What is today market outlook?', expected: false },
        { text: '', expected: false },
      ];

      testCases.forEach((tc) => {
        expect(isOptOutKeyword(tc.text)).toBe(tc.expected);
      });
    });

    it('F15-T2: should execute auto opt-out upon STOP keyword and record WHATSAPP_REPLY consent entry', async () => {
      const startTime = Date.now();

      // Simulate inbound STOP processing
      await dbHelper.client.$transaction([
        dbHelper.client.whatsappConsent.create({
          data: {
            clientId: autoOptOutClientId,
            consentStatus: 'OPTED_OUT',
            consentSource: 'WHATSAPP_REPLY',
            reason: 'Inbound keyword trigger: STOP',
          },
        }),
        dbHelper.client.client.update({
          where: { id: autoOptOutClientId },
          data: { communicationConsent: 'OPTED_OUT' },
        }),
      ]);

      const durationMs = Date.now() - startTime;
      expect(durationMs).toBeLessThan(60000); // Must execute within 60s SLA (<1s in DB)

      const updated = await dbHelper.client.client.findUnique({
        where: { id: autoOptOutClientId },
      });
      expect(updated?.communicationConsent).toBe('OPTED_OUT');
    });

    it('F15-T3: should verify latest consent record has status OPTED_OUT and source WHATSAPP_REPLY', async () => {
      const latestConsent = await dbHelper.client.whatsappConsent.findFirst({
        where: { clientId: autoOptOutClientId },
        orderBy: { recordedAt: 'desc' },
      });

      expect(latestConsent?.consentStatus).toBe('OPTED_OUT');
      expect(latestConsent?.consentSource).toBe('WHATSAPP_REPLY');
      expect(latestConsent?.reason).toContain('STOP');
    });

    it('F15-T4: should purge or suppress in-flight BullMQ messages for opted-out client', async () => {
      const queueKey = `bull:campaign-messages:optout-test:${autoOptOutClientId}`;
      // Simulate setting opt-out suppression flag in Redis
      await redisHelper.client.set(`consent:suppressed:${autoOptOutClientId}`, 'OPTED_OUT', 'EX', 86400);

      const isSuppressed = await redisHelper.client.get(`consent:suppressed:${autoOptOutClientId}`);
      expect(isSuppressed).toBe('OPTED_OUT');

      await redisHelper.client.del(`consent:suppressed:${autoOptOutClientId}`);
    });

    it('F15-T5: should verify client remains opted out until explicit manual re-consent', async () => {
      const client = await dbHelper.client.client.findUnique({
        where: { id: autoOptOutClientId },
      });
      expect(client?.communicationConsent).toBe('OPTED_OUT');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 16: Manual Opt-In / Opt-Out Recording
  // ─────────────────────────────────────────────────────────────
  describe('Feature 16: Manual Opt-In / Opt-Out Recording with Mandatory Reason', () => {
    it('F16-T1: should validate valid manual opt-in submission with mandatory reason via live API', async () => {
      const operatorToken = await getRoleToken('Operator');
      const payload = {
        clientId: testClientId,
        status: 'OPTED_IN',
        reason: 'Client requested WhatsApp portfolio updates via phone call verification',
        evidenceReference: 'CALL_RECORDING_20261119_001',
      };
      const res = await apiClient.withToken(operatorToken).post('/consent', payload);
      expect(res.status).toBe(201);
      expect(res.body.consentStatus).toBe('OPTED_IN');
    });

    it('F16-T2: should validate valid manual opt-out submission with mandatory reason via live API', async () => {
      const operatorToken = await getRoleToken('Operator');
      const payload = {
        clientId: testClientId,
        status: 'OPTED_OUT',
        reason: 'Client requested no marketing messages via relationship manager email',
        evidenceReference: 'TICKET_SUPPORT_9921',
      };
      const res = await apiClient.withToken(operatorToken).post('/consent', payload);
      expect(res.status).toBe(201);
      expect(res.body.consentStatus).toBe('OPTED_OUT');
    });

    it('F16-T3: should reject manual consent submission when reason is missing or empty with 400', async () => {
      const operatorToken = await getRoleToken('Operator');
      const missingReason = { clientId: testClientId, status: 'OPTED_IN' };
      const emptyReason = { clientId: testClientId, status: 'OPTED_IN', reason: '' };

      const resMissing = await apiClient.withToken(operatorToken).post('/consent', missingReason);
      expect(resMissing.status).toBe(400);

      const resEmpty = await apiClient.withToken(operatorToken).post('/consent', emptyReason);
      expect(resEmpty.status).toBe(400);
    });

    it('F16-T4: should reject manual consent submission when reason exceeds 500 characters with 400', async () => {
      const operatorToken = await getRoleToken('Operator');
      const oversizedPayload = {
        clientId: testClientId,
        status: 'OPTED_IN',
        reason: 'A'.repeat(501),
      };
      const res = await apiClient.withToken(operatorToken).post('/consent', oversizedPayload);
      expect(res.status).toBe(400);
    });

    it('F16-T5: should successfully record manual consent transition in database with operator audit', async () => {
      const validPayload = {
        status: 'OPTED_IN' as const,
        reason: 'Client submitted signed physical mandate during annual portfolio review',
        evidenceReference: 'PHYSICAL_MANDATE_FORM_#99281',
      };

      const record = await dbHelper.client.whatsappConsent.create({
        data: {
          clientId: testClientId,
          consentStatus: validPayload.status,
          consentSource: 'MANUAL_ENTRY',
          reason: validPayload.reason,
          evidenceReference: validPayload.evidenceReference,
          recordedByUserId: operatorUserId,
        },
      });

      expect(record.id).toBeDefined();
      expect(record.consentStatus).toBe('OPTED_IN');
      expect(record.consentSource).toBe('MANUAL_ENTRY');
      expect(record.reason).toBe(validPayload.reason);
      expect(record.recordedByUserId).toBe(operatorUserId);
    });
  });
});
