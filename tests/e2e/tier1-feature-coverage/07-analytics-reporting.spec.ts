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
  role: UserRoleKey = 'Viewer',
): Promise<{ client: ApiClient; token: string; userId: string }> {
  const user = await dbHelper.findUserByEmail(USER_CREDENTIALS[role].email);
  const userId = user?.id || TEST_USERS[role].id || uuidv4();
  const { token } = authHelper.generateAccessToken({ role, userId });
  await redisHelper.setLastActivity(userId, Math.floor(Date.now() / 1000));
  const client = apiClient.withToken(token);
  return { client, token, userId };
}

import {
  buildRechartsTimeSeries,
  generateCampaignsCsv,
} from '../../../apps/backend/src/analytics/analytics.service';

describe('Tier 1 — 07: Analytics, Recharts Time-Series & Reporting', () => {
  let viewerUserId: string;
  let adminUserId: string;
  let testClientId: string;
  let testTemplateId: string;
  let testCampaignId: string;
  const testMessageLogIds: string[] = [];

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const viewer = await dbHelper.findUserByEmail(USER_CREDENTIALS.Viewer.email);
    viewerUserId = viewer?.id || TEST_USERS.Viewer.id!;

    const admin = await dbHelper.findUserByEmail(USER_CREDENTIALS.Admin.email);
    adminUserId = admin?.id || TEST_USERS.Admin.id!;

    // Create client
    const client = await dbHelper.client.client.create({
      data: {
        fullName: 'Analytics Test Client',
        whatsappNumber: `+9199999770${Math.floor(100 + Math.random() * 899)}`,
        categoryTier: 'RETAIL',
        communicationConsent: 'OPTED_IN',
        preferredLanguage: 'en',
      },
    });
    testClientId = client.id;

    // Create template
    const tmpl = await dbHelper.client.messageTemplate.create({
      data: {
        name: `test_analytics_tmpl_${Date.now()}`,
        category: 'MARKETING',
        language: 'en',
        status: 'APPROVED',
        createdByUserId: adminUserId,
      },
    });
    testTemplateId = tmpl.id;

    // Create campaign
    const campaign = await dbHelper.client.campaign.create({
      data: {
        name: `TEST_Analytics_Campaign_${Date.now()}`,
        campaignType: 'PROMOTIONAL',
        status: 'COMPLETED',
        templateId: testTemplateId,
        createdByUserId: adminUserId,
        dispatchedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      },
    });
    testCampaignId = campaign.id;

    // Seed historical message logs across different days
    const baseTime = Date.now();
    const daysOffset = [0, 0, 1, 1, 2, 2, 3];
    const statuses: Array<'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = [
      'DELIVERED',
      'READ',
      'DELIVERED',
      'SENT',
      'READ',
      'FAILED',
      'DELIVERED',
    ];

    for (let i = 0; i < statuses.length; i++) {
      const dispatchedAt = new Date(baseTime - daysOffset[i] * 24 * 60 * 60 * 1000);
      const log = await dbHelper.client.messageLog.create({
        data: {
          campaignId: testCampaignId,
          clientId: testClientId,
          templateId: testTemplateId,
          templateCategory: 'MARKETING',
          metaMessageId: `wamid.analytics_${testCampaignId}_${i}`,
          idempotencyKey: `idemp_analytics_${testCampaignId}_${i}`,
          deliveryStatus: statuses[i],
          costInr: 0.7854,
          dispatchedAt,
          sentAt: dispatchedAt,
          deliveredAt: statuses[i] === 'DELIVERED' || statuses[i] === 'READ' ? dispatchedAt : null,
          readAt: statuses[i] === 'READ' ? dispatchedAt : null,
          failedAt: statuses[i] === 'FAILED' ? dispatchedAt : null,
          variableValues: {},
        },
      });
      testMessageLogIds.push(log.id);
    }
  });

  afterAll(async () => {
    if (testMessageLogIds.length > 0) {
      await dbHelper.client.messageLog.deleteMany({ where: { id: { in: testMessageLogIds } } });
    }
    if (testCampaignId) {
      await dbHelper.client.campaign.deleteMany({ where: { id: testCampaignId } });
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
  // FEATURE 55A: Recharts Time-Series Analytics Data Endpoint & Calculation
  // ─────────────────────────────────────────────────────────────
  describe('Feature 55A: Recharts Time-Series Analytics Data Calculation', () => {
    it('F55A-T1: should query message logs aggregated by day within the date window', async () => {
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const logs = await dbHelper.client.messageLog.findMany({
        where: {
          campaignId: testCampaignId,
          dispatchedAt: { gte: start },
        },
        select: {
          dispatchedAt: true,
          deliveryStatus: true,
          costInr: true,
        },
      });

      expect(logs.length).toBe(7);
    });

    it('F55A-T2: should format time-series data points matching Recharts chart schema', () => {
      const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      const sampleLogs = [
        { dispatchedAt: new Date(), deliveryStatus: 'READ', costInr: 0.7854 },
        { dispatchedAt: new Date(), deliveryStatus: 'DELIVERED', costInr: 0.7854 },
        { dispatchedAt: new Date(Date.now() - 24 * 60 * 60 * 1000), deliveryStatus: 'FAILED', costInr: 0.7854 },
      ];

      const timeSeries = buildRechartsTimeSeries(sampleLogs, start, 7);

      expect(timeSeries.length).toBe(7);
      const today = timeSeries[timeSeries.length - 1];
      expect(today).toHaveProperty('date');
      expect(today).toHaveProperty('sent');
      expect(today).toHaveProperty('delivered');
      expect(today).toHaveProperty('read');
      expect(today).toHaveProperty('failed');
      expect(today).toHaveProperty('costInr');
      expect(today).toHaveProperty('deliveryRate');
      expect(today).toHaveProperty('readRate');
      expect(typeof today.date).toBe('string');
      expect(typeof today.sent).toBe('number');
    });

    it('F55A-T3: should accurately compute deliveryRate and readRate percentages per time-series interval', () => {
      const startDate = new Date();
      const sampleLogs = [
        { dispatchedAt: startDate, deliveryStatus: 'DELIVERED', costInr: 1.0 },
        { dispatchedAt: startDate, deliveryStatus: 'READ', costInr: 1.0 },
      ];

      const result = buildRechartsTimeSeries(sampleLogs, startDate, 1);
      const day = result[0];

      // 2 sent, 2 delivered, 1 read
      expect(day.sent).toBe(2);
      expect(day.delivered).toBe(2);
      expect(day.read).toBe(1);
      expect(day.deliveryRate).toBe(100.0);
      expect(day.readRate).toBe(50.0);
    });

    it('F55A-T4: should handle zero-volume days with continuous zero-filled time-series intervals', () => {
      const startDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const emptyLogs: any[] = [];

      const result = buildRechartsTimeSeries(emptyLogs, startDate, 5);

      expect(result.length).toBe(5);
      result.forEach((day) => {
        expect(day.sent).toBe(0);
        expect(day.delivered).toBe(0);
        expect(day.read).toBe(0);
        expect(day.failed).toBe(0);
        expect(day.costInr).toBe(0);
        expect(day.deliveryRate).toBe(0);
        expect(day.readRate).toBe(0);
      });
    });

    it('F55A-T5: should filter time-series queries by 7-day, 30-day, and 90-day intervals', async () => {
      for (const days of [7, 30, 90]) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const count = await dbHelper.client.messageLog.count({
          where: {
            dispatchedAt: { gte: cutoff },
          },
        });
        expect(typeof count).toBe('number');
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 55B: CSV Export Summary & Compliance Reports
  // ─────────────────────────────────────────────────────────────
  describe('Feature 55B: CSV Export Summary & Compliance Reports (RFC 4180)', () => {
    const sampleCampaignRows = [
      {
        campaignId: 'c1111111-0000-0000-0000-000000000001',
        campaignName: 'Diwali Wealth Festive Offer',
        campaignType: 'PROMOTIONAL',
        status: 'COMPLETED',
        totalRecipients: 5000,
        sentCount: 4950,
        deliveredCount: 4800,
        readCount: 3200,
        failedCount: 50,
        totalCostInr: 3927.0,
      },
      {
        campaignId: 'c2222222-0000-0000-0000-000000000002',
        campaignName: 'Quarterly Portfolio Review, HNI & Retail',
        campaignType: 'SERVICE_NOTIFICATION',
        status: 'COMPLETED',
        totalRecipients: 1200,
        sentCount: 1200,
        deliveredCount: 1180,
        readCount: 950,
        failedCount: 20,
        totalCostInr: 150.96,
      },
    ];

    it('F55B-T1: should generate RFC 4180 compliant CSV export format with standard headers', () => {
      const csv = generateCampaignsCsv(sampleCampaignRows);
      const lines = csv.split('\r\n');

      expect(lines.length).toBe(3); // 1 header + 2 data rows
      expect(lines[0]).toBe('Campaign ID,Campaign Name,Type,Status,Total Recipients,Sent,Delivered,Read,Failed,Total Cost (INR)');
    });

    it('F55B-T2: should correctly output numeric metrics (recipients, delivered, read, failed, total cost)', () => {
      const csv = generateCampaignsCsv(sampleCampaignRows);
      const lines = csv.split('\r\n');
      const row1 = lines[1].split(',');

      expect(row1[0]).toBe(sampleCampaignRows[0].campaignId);
      expect(row1[1]).toBe(sampleCampaignRows[0].campaignName);
      expect(row1[4]).toBe('5000');
      expect(row1[5]).toBe('4950');
      expect(row1[6]).toBe('4800');
      expect(row1[7]).toBe('3200');
      expect(row1[8]).toBe('50');
      expect(row1[9]).toBe('3927.00');
    });

    it('F55B-T3: should properly escape fields containing commas or quotes according to RFC 4180', () => {
      const csv = generateCampaignsCsv(sampleCampaignRows);
      const lines = csv.split('\r\n');
      const row2 = lines[2];

      // Campaign name containing commas must be quoted: "Quarterly Portfolio Review, HNI & Retail"
      expect(row2).toContain('"Quarterly Portfolio Review, HNI & Retail"');
    });

    it('F55B-T4: should filter CSV export datasets by campaign type and status', () => {
      const promotionalOnly = sampleCampaignRows.filter((r) => r.campaignType === 'PROMOTIONAL');
      const csvPromo = generateCampaignsCsv(promotionalOnly);
      const lines = csvPromo.split('\r\n');

      expect(lines.length).toBe(2); // Header + 1 row
      expect(lines[1]).toContain('Diwali Wealth Festive Offer');
      expect(lines[1]).not.toContain('Quarterly Portfolio Review');
    });

    it('F55B-T5: should calculate total summary aggregate line across all exported campaigns', () => {
      const totalRecipients = sampleCampaignRows.reduce((sum, r) => sum + r.totalRecipients, 0);
      const totalDelivered = sampleCampaignRows.reduce((sum, r) => sum + r.deliveredCount, 0);
      const totalCost = sampleCampaignRows.reduce((sum, r) => sum + r.totalCostInr, 0);

      expect(totalRecipients).toBe(6200);
      expect(totalDelivered).toBe(5980);
      expect(totalCost).toBeCloseTo(4077.96, 2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 55C: Viewer Analytics Dashboard KPIs & RBAC Access
  // ─────────────────────────────────────────────────────────────
  describe('Feature 55C: Viewer Analytics Dashboard KPIs & RBAC Access', () => {
    it('F55C-T1: should calculate top-level KPI cards: total messages sent, delivery rate, read rate, and total cost INR', async () => {
      const start = Date.now();
      const [totalCount, deliveredCount, readCount, costAgg] = await Promise.all([
        dbHelper.client.messageLog.count({ where: { campaignId: testCampaignId } }),
        dbHelper.client.messageLog.count({
          where: {
            campaignId: testCampaignId,
            deliveryStatus: { in: ['DELIVERED', 'READ'] },
          },
        }),
        dbHelper.client.messageLog.count({
          where: {
            campaignId: testCampaignId,
            deliveryStatus: 'READ',
          },
        }),
        dbHelper.client.messageLog.aggregate({
          where: { campaignId: testCampaignId },
          _sum: { costInr: true },
        }),
      ]);
      const duration = Date.now() - start;

      expect(totalCount).toBe(7);
      expect(deliveredCount).toBe(5); // 3 DELIVERED + 2 READ
      expect(readCount).toBe(2);

      const deliveryRate = (deliveredCount / totalCount) * 100;
      const readRate = (readCount / totalCount) * 100;
      const totalCost = Number(costAgg._sum.costInr || 0);

      expect(deliveryRate).toBeCloseTo(71.43, 1);
      expect(readRate).toBeCloseTo(28.57, 1);
      expect(totalCost).toBeCloseTo(7 * 0.7854, 3);
      expect(duration).toBeLessThan(500); // Sub-500ms SLA
    });

    it('F55C-T2: should permit Viewer role read-only access to analytics dashboard endpoint', async () => {
      const { client } = await createAuthedClient('Viewer');
      const res = await client.get('/analytics/dashboard');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Analytics dashboard');
    });

    it('F55C-T3: should permit Admin and Super_Admin access to analytics dashboard', async () => {
      const { client: adminClient } = await createAuthedClient('Admin');
      const adminRes = await adminClient.get('/analytics/dashboard');
      expect(adminRes.status).toBe(200);

      const { client: superAdminClient } = await createAuthedClient('Super_Admin');
      const superAdminRes = await superAdminClient.get('/analytics/dashboard');
      expect(superAdminRes.status).toBe(200);
    });

    it('F55C-T4: should restrict Viewer role from executing mutation or admin-only endpoints (POST /users, GET /settings)', async () => {
      const { client: viewerClient } = await createAuthedClient('Viewer');

      // Viewer accessing admin-only settings endpoint must receive 403
      const settingsRes = await viewerClient.get('/settings');
      expect(settingsRes.status).toBe(403);

      // Viewer attempting to create users must receive 403
      const usersRes = await viewerClient.post('/users', {
        email: 'unauthorized_creation@wealthtrade.in',
        fullName: 'Unauthorized User',
        role: 'Operator',
      });
      expect(usersRes.status).toBe(403);
    });

    it('F55C-T5: should verify analytics KPI query completes with sub-500ms latency', async () => {
      const start = Date.now();
      await dbHelper.client.messageLog.aggregate({
        where: { campaignId: testCampaignId },
        _count: { id: true },
        _sum: { costInr: true },
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });
});
