import { v4 as uuidv4 } from 'uuid';
import { apiClient, ApiClient } from '../../helpers/api-client';
import { authHelper } from '../../helpers/auth-helper';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import { USER_CREDENTIALS, UserRoleKey, TEST_USERS } from '../../fixtures/users.fixture';

/**
 * Creates authenticated client for a specified role.
 */
async function createAuthedClient(
  role: UserRoleKey = 'Admin',
): Promise<{ client: ApiClient; token: string; userId: string }> {
  const user = await dbHelper.findUserByEmail(USER_CREDENTIALS[role].email);
  const userId = user?.id || TEST_USERS[role].id || uuidv4();
  const { token } = authHelper.generateAccessToken({ role, userId });
  await redisHelper.setLastActivity(userId, Math.floor(Date.now() / 1000));
  const client = apiClient.withToken(token);
  return { client, token, userId };
}

describe('Tier 1 — 08: Application Settings, Audit Logging & Health Probes', () => {
  let adminUserId: string;
  let superAdminUserId: string;
  const testSettingKeys: string[] = [];

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const admin = await dbHelper.findUserByEmail(USER_CREDENTIALS.Admin.email);
    adminUserId = admin?.id || TEST_USERS.Admin.id!;

    const superAdmin = await dbHelper.findUserByEmail(USER_CREDENTIALS.Super_Admin.email);
    superAdminUserId = superAdmin?.id || TEST_USERS.Super_Admin.id!;
  });

  afterAll(async () => {
    if (testSettingKeys.length > 0) {
      await dbHelper.client.applicationSetting.deleteMany({
        where: { key: { in: testSettingKeys } },
      });
    }
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    await redisHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 44: Application Settings Hot-Reload (LISTEN/NOTIFY)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 44: Application Settings Hot-Reload (LISTEN/NOTIFY)', () => {
    it('F44-T1: should upsert application setting in application_settings table with JSON value', async () => {
      const settingKey = `meta_pricing_test_${Date.now()}`;
      testSettingKeys.push(settingKey);

      const pricingConfig = {
        MARKETING: 0.7854,
        UTILITY: 0.1258,
        AUTHENTICATION: 0.1258,
        currency: 'INR',
        gstRate: 0.18,
      };

      const saved = await dbHelper.client.applicationSetting.upsert({
        where: { key: settingKey },
        create: {
          key: settingKey,
          value: pricingConfig,
          updatedByUserId: adminUserId,
        },
        update: {
          value: pricingConfig,
          updatedByUserId: adminUserId,
        },
      });

      expect(saved.key).toBe(settingKey);
      expect((saved.value as any).MARKETING).toBe(0.7854);
      expect((saved.value as any).currency).toBe('INR');
      expect(saved.updatedByUserId).toBe(adminUserId);
    });

    it('F44-T2: should verify PostgreSQL trigger settings_notify_trigger exists for both INSERT and UPDATE events', async () => {
      const triggers: any[] = await dbHelper.client.$queryRaw`
        SELECT trigger_name, event_manipulation, event_object_table, action_statement
        FROM information_schema.triggers
        WHERE event_object_table = 'application_settings'
          AND trigger_name = 'settings_notify_trigger'
      `;

      expect(triggers.length).toBeGreaterThanOrEqual(1);
      const events = triggers.map((t) => t.event_manipulation);
      expect(events).toContain('INSERT');
      expect(events).toContain('UPDATE');
    });

    it('F44-T3: should verify function notify_settings_changed() is configured with pg_notify on settings_changed channel', async () => {
      const procs: any[] = await dbHelper.client.$queryRaw`
        SELECT pg_get_functiondef(oid) as def
        FROM pg_proc
        WHERE proname = 'notify_settings_changed'
      `;

      expect(procs.length).toBe(1);
      const def = procs[0].def;
      expect(def).toContain('pg_notify');
      expect(def).toContain('settings_changed');
      expect(def).toContain('NEW.key');
    });

    it('F44-T4: should persist and update structured rate limiter configuration without schema migration', async () => {
      const rateLimitKey = `rate_limiter_config_${Date.now()}`;
      testSettingKeys.push(rateLimitKey);

      const initialConfig = {
        maxMessagesPerSecond: 80,
        burstCapacity: 100,
        enforcePerSecondRate: true,
      };

      await dbHelper.client.applicationSetting.create({
        data: {
          key: rateLimitKey,
          value: initialConfig,
          updatedByUserId: superAdminUserId,
        },
      });

      // Hot-update configuration
      const updatedConfig = {
        ...initialConfig,
        maxMessagesPerSecond: 100, // Upgraded tier
      };

      const updated = await dbHelper.client.applicationSetting.update({
        where: { key: rateLimitKey },
        data: {
          value: updatedConfig,
          updatedByUserId: superAdminUserId,
        },
      });

      expect((updated.value as any).maxMessagesPerSecond).toBe(100);
      expect((updated.value as any).burstCapacity).toBe(100);
    });

    it('F44-T5: should enforce that settings read endpoint requires Admin/Super_Admin role and rejects Operator/Viewer with 403', async () => {
      // Admin should be allowed
      const { client: adminClient } = await createAuthedClient('Admin');
      const adminRes = await adminClient.get('/settings');
      expect(adminRes.status).toBe(200);

      // Super_Admin should be allowed
      const { client: superAdminClient } = await createAuthedClient('Super_Admin');
      const superAdminRes = await superAdminClient.get('/settings');
      expect(superAdminRes.status).toBe(200);

      // Operator must be rejected with 403
      const { client: operatorClient } = await createAuthedClient('Operator');
      const operatorRes = await operatorClient.get('/settings');
      expect(operatorRes.status).toBe(403);

      // Viewer must be rejected with 403
      const { client: viewerClient } = await createAuthedClient('Viewer');
      const viewerRes = await viewerClient.get('/settings');
      expect(viewerRes.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 45: Append-Only Audit Logging (Property P4)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 45: Append-Only Audit Logging (Property P4)', () => {
    it('F45-T1: should verify audit_logs table has Row-Level Security (RLS) enabled in PostgreSQL (Property P4)', async () => {
      const result: any[] = await dbHelper.client.$queryRaw`
        SELECT relname, relrowsecurity
        FROM pg_class
        WHERE relname = 'audit_logs'
      `;

      expect(result.length).toBe(1);
      expect(result[0].relrowsecurity).toBe(true);
    });

    it('F45-T2: should verify policy audit_insert_only is defined on audit_logs for INSERT command only', async () => {
      const policies: any[] = await dbHelper.client.$queryRaw`
        SELECT policyname, tablename, cmd, with_check
        FROM pg_policies
        WHERE tablename = 'audit_logs'
      `;

      expect(policies.length).toBeGreaterThanOrEqual(1);
      const insertPolicy = policies.find((p) => p.policyname === 'audit_insert_only');
      expect(insertPolicy).toBeDefined();
      expect(insertPolicy?.cmd).toBe('INSERT');
    });

    it('F45-T3: should verify no UPDATE or DELETE policies exist on audit_logs enforcing append-only immutability', async () => {
      const policies: any[] = await dbHelper.client.$queryRaw`
        SELECT policyname, cmd
        FROM pg_policies
        WHERE tablename = 'audit_logs'
      `;

      const updatePolicies = policies.filter((p) => p.cmd === 'UPDATE');
      const deletePolicies = policies.filter((p) => p.cmd === 'DELETE');

      // Property P4: strict append-only requires zero update or delete policies
      expect(updatePolicies.length).toBe(0);
      expect(deletePolicies.length).toBe(0);
    });

    it('F45-T4: should insert audit log entry capturing actorId, actorRole, actionType, and before/after diffs', async () => {
      const resourceId = uuidv4();
      const beforeState = { role: 'Operator', accountStatus: 'ACTIVE' };
      const afterState = { role: 'Admin', accountStatus: 'ACTIVE' };

      const auditEntry = await dbHelper.client.auditLog.create({
        data: {
          actorId: superAdminUserId,
          actorRole: 'Super_Admin',
          actionType: 'ROLE_CHANGE',
          resourceType: 'User',
          resourceId,
          ipAddress: '192.168.1.100',
          beforeState,
          afterState,
          metadata: { reason: 'Promotion to Operations Admin' },
        },
      });

      expect(auditEntry.id).toBeDefined();
      expect(auditEntry.actorRole).toBe('Super_Admin');
      expect(auditEntry.actionType).toBe('ROLE_CHANGE');
      expect((auditEntry.beforeState as any).role).toBe('Operator');
      expect((auditEntry.afterState as any).role).toBe('Admin');
      expect(auditEntry.ipAddress).toBe('192.168.1.100');
    });

    it('F45-T5: should query audit log history and filter by actorId, actionType, or resourceType in sub-500ms', async () => {
      const start = Date.now();
      const logs = await dbHelper.client.auditLog.findMany({
        where: {
          actorId: superAdminUserId,
          actionType: 'ROLE_CHANGE',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const duration = Date.now() - start;

      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(duration).toBeLessThan(500); // Sub-500ms query performance
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 46: System Health Probes (Postgres, Redis, API)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 46: System Health Probes (Postgres, Redis, API)', () => {
    it('F46-T1: should verify GET /api/v1/health responds with HTTP 200 and valid JSON body', async () => {
      const res = await apiClient.get('/health');

      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('object');
    });

    it('F46-T2: should verify response body contains service: "wt-whatsapp-api", version: "1.0.0", and status: "healthy"', async () => {
      const res = await apiClient.get('/health');

      expect(res.body.service).toBe('wt-whatsapp-api');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.status).toBe('healthy');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('F46-T3: should verify database probe verifies PostgreSQL connectivity and returns database.status: "ok" with latency_ms', async () => {
      const res = await apiClient.get('/health');

      expect(res.body).toHaveProperty('database');
      expect(res.body.database.status).toBe('ok');
      expect(typeof res.body.database.latency_ms).toBe('number');
      expect(res.body.database.latency_ms).toBeLessThan(500);
    });

    it('F46-T4: should verify Redis probe verifies Redis connectivity and returns redis.status: "ok"', async () => {
      const res = await apiClient.get('/health');

      expect(res.body).toHaveProperty('redis');
      expect(res.body.redis.status).toBe('ok');

      // Out-of-band direct verification via Redis ping
      const directPong = await redisHelper.ping();
      expect(directPong).toBe('PONG');
    });

    it('F46-T5: should verify health probe is publicly accessible without Bearer token and executes in sub-500ms', async () => {
      const start = Date.now();
      const res = await apiClient.get('/health'); // Unauthenticated request
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(500); // Suitable for high-frequency k8s / alb health checks
    });
  });
});
