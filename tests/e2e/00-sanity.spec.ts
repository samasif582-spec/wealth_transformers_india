import { apiClient, ApiClient } from '../helpers/api-client';
import { authHelper } from '../helpers/auth-helper';
import { dbHelper } from '../helpers/db-helper';
import { redisHelper } from '../helpers/redis-helper';
import { webhookSigner } from '../helpers/webhook-signer';
import { mockMetaServer } from '../helpers/mock-meta-server';
import { checkBackendServer, checkPostgresConnectivity, checkRedisConnectivity } from '../setup';
import {
  USER_CREDENTIALS,
  TEST_USERS,
  ROLE_PERMISSIONS_MATRIX,
  UserRoleKey,
} from '../fixtures/users.fixture';
import {
  VALID_PHONE_NUMBERS,
  MALFORMED_PHONE_NUMBERS,
  SAMPLE_CLIENTS,
  VALID_CLIENTS_CSV,
} from '../fixtures/clients.fixture';
import {
  SEBI_AMFI_MANDATORY_FOOTER,
  COMPLIANT_MARKETING_TEMPLATE,
  NON_COMPLIANT_MARKETING_TEMPLATE_NO_FOOTER,
  VARIABLE_REGEX_TEST_CASES,
} from '../fixtures/templates.fixture';
import {
  CAMPAIGN_PRICING_TEST_VECTORS,
  computeCampaignCost,
  SAMPLE_WIZARD_PAYLOAD,
} from '../fixtures/campaigns.fixture';
import {
  STATUS_MONOTONIC_RANK,
  MONOTONIC_TEST_SEQUENCE,
  createDeliveryStatusWebhook,
  createInboundMessageWebhook,
} from '../fixtures/webhooks.fixture';

describe('Sanity Test Suite — E2E Test Infrastructure & Runners', () => {
  beforeAll(async () => {
    // Ensure test users exist if database is fresh
    await dbHelper.ensureTestUsersExist();
  });

  afterAll(async () => {
    // Clean up test fixtures & close handles
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    await redisHelper.disconnect();
    if (mockMetaServer.isRunning) {
      await mockMetaServer.stop();
    }
  });

  describe('1. Environment Pre-Flight Health Probes', () => {
    it('should verify live backend API server connectivity at http://127.0.0.1:3000/api/v1/health', async () => {
      const probe = await checkBackendServer();
      expect(probe.ok).toBe(true);
      expect(probe.status).toBe(200);
      expect(probe.body).toHaveProperty('status', 'healthy');
    });

    it('should verify direct PostgreSQL 15 database connectivity on port 5435', async () => {
      const dbProbe = await checkPostgresConnectivity();
      expect(dbProbe.ok).toBe(true);
    });

    it('should verify direct Redis 7 cache & message broker connectivity on port 6379', async () => {
      const redisProbe = await checkRedisConnectivity();
      expect(redisProbe.ok).toBe(true);
      expect(redisProbe.ping).toBe('PONG');
    });
  });

  describe('2. ApiClient Helper (Opaque-Box HTTP Interface)', () => {
    it('should execute GET /health through ApiClient and receive valid JSON', async () => {
      const res = await apiClient.get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        service: 'wt-whatsapp-api',
        version: '1.0.0',
        status: 'healthy',
        database: { status: 'ok' },
        redis: { status: 'ok' },
      });
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('should support clone with Bearer token and custom headers', () => {
      const token = 'sample.jwt.token';
      const authed = apiClient.withToken(token).withHeader('X-Custom-Header', 'custom-value');
      expect(authed).toBeInstanceOf(Object);
      expect(authed.serverUrl).toBe(apiClient.serverUrl);
    });

    it('should support internal API secret header decoration', () => {
      const internalClient = apiClient.withInternalApiKey();
      expect(internalClient).toBeDefined();
    });
  });

  describe('3. DbHelper (Direct PrismaClient Out-of-Band State Assertion)', () => {
    it('should query the seeded Super Admin user directly from the database', async () => {
      const superAdmin = await dbHelper.findUserByEmail('superadmin@wealthtrade.in');
      expect(superAdmin).not.toBeNull();
      expect(superAdmin?.email).toBe('superadmin@wealthtrade.in');
      expect(superAdmin?.role).toBe('Super_Admin');
      expect(superAdmin?.accountStatus).toBe('ACTIVE');
    });

    it('should verify seeded application settings exist in application_settings table', async () => {
      const pricingSetting = await dbHelper.client.applicationSetting.findUnique({
        where: { key: 'meta_pricing' },
      });
      expect(pricingSetting).not.toBeNull();
      expect(Array.isArray(pricingSetting?.value)).toBe(true);

      const gstSetting = await dbHelper.client.applicationSetting.findUnique({
        where: { key: 'gst_rate' },
      });
      expect(gstSetting).not.toBeNull();
      expect(gstSetting?.value).toBe(0.18);
    });

    it('should execute raw SQL query safely', async () => {
      const result = await dbHelper.executeRaw('SELECT 1 + 1 as sum');
      expect(result).toBeDefined();
    });
  });

  describe('4. RedisHelper (Lockout, Token Denylist & BullMQ Inspection)', () => {
    const testUserId = 'test-sanity-user-001';
    const testJti = 'test-sanity-jti-001';

    it('should ping Redis and verify PONG', async () => {
      const pong = await redisHelper.ping();
      expect(pong).toBe('PONG');
    });

    it('should manage and assert user lockout counters in Redis (auth:lockout:{userId})', async () => {
      await redisHelper.resetLockout(testUserId);
      expect(await redisHelper.getLockoutCount(testUserId)).toBe(0);

      await redisHelper.setLockoutCount(testUserId, 3);
      expect(await redisHelper.getLockoutCount(testUserId)).toBe(3);

      await redisHelper.setLockoutCount(testUserId, 5);
      expect(await redisHelper.getLockoutCount(testUserId)).toBe(5);

      await redisHelper.resetLockout(testUserId);
      expect(await redisHelper.getLockoutCount(testUserId)).toBe(0);
    });

    it('should manage and assert token denylist status in Redis (auth:denylist:{jti})', async () => {
      expect(await redisHelper.isTokenDenylisted(testJti)).toBe(false);

      await redisHelper.denylistToken(testJti, 60);
      expect(await redisHelper.isTokenDenylisted(testJti)).toBe(true);

      await redisHelper.removeTokenFromDenylist(testJti);
      expect(await redisHelper.isTokenDenylisted(testJti)).toBe(false);
    });

    it('should assert campaign idempotency keys (idempotency:*) with SET NX behavior', async () => {
      const idempKey = 'idempotency:test:sanity:1';
      await redisHelper.client.del(idempKey);

      const firstSet = await redisHelper.setIdempotencyKey(idempKey, 'PROCESSED', 60);
      expect(firstSet).toBe(true);

      const secondSet = await redisHelper.setIdempotencyKey(idempKey, 'PROCESSED', 60);
      expect(secondSet).toBe(false); // Second SET NX must fail (deduplicated)

      await redisHelper.client.del(idempKey);
    });

    it('should initialize and inspect BullMQ queue state', async () => {
      const counts = await redisHelper.getQueueJobCounts('campaign-messages');
      expect(counts).toHaveProperty('waiting');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('completed');
      expect(counts).toHaveProperty('failed');
      expect(typeof counts.waiting).toBe('number');
    });
  });

  describe('5. AuthHelper (RS256 JWT Generation & Role Permissions Matrix)', () => {
    const roles: UserRoleKey[] = [
      'Super_Admin',
      'Admin',
      'Marketing_Employee',
      'Operator',
      'Viewer',
    ];

    it.each(roles)('should generate cryptographically valid RS256 token pair for role %s', (role) => {
      const tokenPair = authHelper.generateTokenPair(role);
      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.jti).toBeDefined();

      const decoded = authHelper.verifyToken(tokenPair.accessToken) as any;
      expect(decoded.role).toBe(role);
      expect(decoded.jti).toBe(tokenPair.jti);
      expect(decoded.sub).toBeDefined();
    });

    it('should correctly configure dashboard route and permissions per role', () => {
      expect(ROLE_PERMISSIONS_MATRIX.Super_Admin.dashboardRoute).toBe('/admin/governance');
      expect(ROLE_PERMISSIONS_MATRIX.Admin.dashboardRoute).toBe('/admin/operations');
      expect(ROLE_PERMISSIONS_MATRIX.Marketing_Employee.dashboardRoute).toBe('/marketing/hub');
      expect(ROLE_PERMISSIONS_MATRIX.Operator.dashboardRoute).toBe('/operator/engagement');
      expect(ROLE_PERMISSIONS_MATRIX.Viewer.dashboardRoute).toBe('/analytics/viewer');

      expect(ROLE_PERMISSIONS_MATRIX.Super_Admin.canManageUsers).toBe(true);
      expect(ROLE_PERMISSIONS_MATRIX.Admin.canManageUsers).toBe(false);
      expect(ROLE_PERMISSIONS_MATRIX.Admin.canApproveCampaigns).toBe(true);
      expect(ROLE_PERMISSIONS_MATRIX.Marketing_Employee.canApproveCampaigns).toBe(false);
    });
  });

  describe('6. WebhookSigner (Meta X-Hub-Signature-256 HMAC-SHA256)', () => {
    const samplePayload = {
      object: 'whatsapp_business_account',
      entry: [{ id: '12345', changes: [] }],
    };

    it('should generate authentic sha256= signature header', () => {
      const signature = webhookSigner.generateSignature(samplePayload);
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should verify genuine signature using timingSafeEqual', () => {
      const signature = webhookSigner.generateSignature(samplePayload);
      const isValid = webhookSigner.verifySignature(samplePayload, signature);
      expect(isValid).toBe(true);
    });

    it('should reject tampered signature', () => {
      const tampered = webhookSigner.generateTamperedSignature(samplePayload);
      const isValid = webhookSigner.verifySignature(samplePayload, tampered);
      expect(isValid).toBe(false);
    });
  });

  describe('7. MockMetaServer (In-Process Meta Graph API & R2 Simulator)', () => {
    let mockPort: number;

    beforeAll(async () => {
      mockPort = await mockMetaServer.start();
    });

    afterAll(async () => {
      await mockMetaServer.stop();
    });

    it('should start on ephemeral port and report isRunning = true', () => {
      expect(mockPort).toBeGreaterThan(0);
      expect(mockMetaServer.isRunning).toBe(true);
      expect(mockMetaServer.url).toContain(`127.0.0.1:${mockPort}`);
    });

    it('should simulate WhatsApp message dispatch endpoint and record request', async () => {
      const client = new ApiClient(mockMetaServer.url, '');
      const res = await client.post('/v20.0/123456789/messages', {
        messaging_product: 'whatsapp',
        to: '+919876543210',
        type: 'text',
        text: { body: 'Hello World' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('messages');
      expect(res.body.messages[0].id).toMatch(/^wamid\.HBgL/);

      const requests = mockMetaServer.getReceivedRequests('/messages');
      expect(requests.length).toBeGreaterThan(0);
      expect(requests[0].method).toBe('POST');
    });

    it('should simulate Cloudflare R2 presigned upload endpoint', async () => {
      const client = new ApiClient(mockMetaServer.url, '');
      const res = await client.put('/upload/sample-asset.pdf', 'dummy-binary-data');
      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('should allow setting custom mock responses and error simulation', async () => {
      mockMetaServer.setSimulatedFailure(true, 503);
      const client = new ApiClient(mockMetaServer.url, '');
      const res = await client.get('/v20.0/any-path');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(500);

      mockMetaServer.setSimulatedFailure(false);
    });
  });

  describe('8. Test Fixtures Integrity & Contract Assertions', () => {
    it('should validate all phone number fixtures', () => {
      expect(VALID_PHONE_NUMBERS.length).toBeGreaterThan(3);
      VALID_PHONE_NUMBERS.forEach((phone) => {
        expect(phone).toMatch(/^\+[1-9]\d{6,14}$/); // E.164 format
      });

      expect(MALFORMED_PHONE_NUMBERS.length).toBeGreaterThan(3);
    });

    it('should validate CSV sample strings', () => {
      expect(VALID_CLIENTS_CSV).toContain('full_name,whatsapp_number,email');
      const lines = VALID_CLIENTS_CSV.split('\n');
      expect(lines.length).toBe(6); // 1 header + 5 clients
    });

    it('should validate SEBI/AMFI footer fixture on compliant marketing template', () => {
      expect(COMPLIANT_MARKETING_TEMPLATE.footerText).toBe(SEBI_AMFI_MANDATORY_FOOTER);
      expect(NON_COMPLIANT_MARKETING_TEMPLATE_NO_FOOTER.footerText).toBeUndefined();
    });

    it('should validate variable regex extraction test vectors', () => {
      const regex = /\{\{(\d+)\}\}/g;
      VARIABLE_REGEX_TEST_CASES.forEach((tc) => {
        const matches = [...tc.bodyText.matchAll(regex)].map((m) => m[1]);
        expect(matches).toEqual(tc.expectedPlaceholders);
      });
    });

    it('should compute and verify accurate campaign costs with 18% GST (Property P8)', () => {
      CAMPAIGN_PRICING_TEST_VECTORS.forEach((vector) => {
        const calculated = computeCampaignCost(vector.recipients, vector.category);
        expect(calculated.rate).toBe(vector.expectedRatePerMsg);
        expect(calculated.totalCost).toBeCloseTo(vector.expectedTotalCost, 2);
      });
    });

    it('should assert monotonic delivery status ranks (Property P3)', () => {
      expect(STATUS_MONOTONIC_RANK.QUEUED).toBeLessThan(STATUS_MONOTONIC_RANK.SENT);
      expect(STATUS_MONOTONIC_RANK.SENT).toBeLessThan(STATUS_MONOTONIC_RANK.DELIVERED);
      expect(STATUS_MONOTONIC_RANK.DELIVERED).toBeLessThan(STATUS_MONOTONIC_RANK.READ);
      expect(MONOTONIC_TEST_SEQUENCE.sent).toBeDefined();
      expect(MONOTONIC_TEST_SEQUENCE.delivered).toBeDefined();
      expect(MONOTONIC_TEST_SEQUENCE.read).toBeDefined();

      const customWebhook = createDeliveryStatusWebhook('wamid.custom_01', 'sent');
      expect(customWebhook.entry[0].changes[0].value.statuses?.[0].status).toBe('sent');

      const inboundWebhook = createInboundMessageWebhook('919876543210', 'STOP');
      expect(inboundWebhook.entry[0].changes[0].value.messages?.[0].text?.body).toBe('STOP');
    });

    it('should validate user, client and campaign fixture collections', () => {
      expect(Object.keys(USER_CREDENTIALS)).toHaveLength(5);
      expect(Object.keys(TEST_USERS)).toHaveLength(5);
      expect(SAMPLE_CLIENTS.length).toBeGreaterThan(0);
      expect(SAMPLE_WIZARD_PAYLOAD.step1.name).toContain('Diwali');
      expect(SAMPLE_WIZARD_PAYLOAD.step5.acknowledgedGst).toBe(true);
    });
  });
});
