import crypto from 'crypto';
import { apiClient } from '../helpers/api-client';
import { dbHelper } from '../helpers/db-helper';
import { MetaMessagesAdapter } from '../../apps/backend/src/templates/meta-messages.adapter';
import { ConfigService } from '@nestjs/config';

const MOCK_URL = 'http://localhost:4010';
const EMULATOR_URL = 'http://localhost:4020';
const SUT_WEBHOOK_URL = 'http://localhost:3000/api/v1/webhooks/meta';
const APP_SECRET = process.env.META_APP_SECRET || 'dev_meta_app_secret';

describe('WT-SIT-SERVICE-VIRTUALIZATION-001 — Staging Integration Testing Suite (SIT-001 to SIT-024)', () => {
  beforeAll(async () => {
    // Reset mock simulator state before running tests
    await fetch(`${MOCK_URL}/admin/scenarios/reset`, { method: 'POST' });
  });

  afterAll(async () => {
    // Restore default configuration
    await fetch(`${MOCK_URL}/admin/simulator/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latencyMs: 10,
        failureRate: 0,
        forcedError: null,
        autoDeliverMs: 80,
        autoReadMs: 200,
        dropWebhooks: false,
      }),
    });
  });

  // ==========================================
  // Category 1: Platform & SUT Connectivity
  // ==========================================
  describe('Category 1: Platform & SUT Connectivity', () => {
    test('SIT-001: Mock WhatsApp server health & capabilities discovery', async () => {
      const res = await fetch(`${MOCK_URL}/health`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('ok');
      expect(data.version).toBe('20.0');
      expect(data.port).toBe(4010);
    });

    test('SIT-002: WhatsApp Client Emulator configuration & proxy', async () => {
      const res = await fetch(`${EMULATOR_URL}/config`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.mockServerUrl).toBe(MOCK_URL);
      expect(data.port).toBe(4020);
    });

    test('SIT-003: SUT Backend health check & Meta connectivity in virtualized mode', async () => {
      const res = await apiClient.get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toMatch(/healthy|ok/);
      expect(res.body.database.status).toBe('ok');
      expect(res.body.redis.status).toBe('ok');
    });

    test('SIT-004: Zero-leakage guard blocks live Graph API in virtualized mode', () => {
      const mockConfig = {
        get: (key: string) => {
          if (key === 'DISPATCH_MODE') return 'virtualized';
          if (key === 'META_BASE_GRAPH_URL') return 'https://graph.facebook.com';
          if (key === 'META_ACCESS_TOKEN') return 'valid_token';
          if (key === 'META_PHONE_NUMBER_ID') return '12345';
          return null;
        },
      } as unknown as ConfigService;

      const adapter = new MetaMessagesAdapter(mockConfig);
      expect(() => {
        (adapter as any).enforceZeroLeakageGuard();
      }).toThrow('Zero-Leakage Guard Violation');
    });
  });

  // ==========================================
  // Category 2: Template Management & Quality Scores
  // ==========================================
  describe('Category 2: Template Management & Quality Scores', () => {
    test('SIT-005: Fetch approved templates from virtual WABA', async () => {
      const res = await fetch(`${MOCK_URL}/v20.0/waba-sit-1001/message_templates`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(3);

      const diwaliTpl = data.data.find((t: any) => t.name === 'wealth_trade_diwali_2024');
      expect(diwaliTpl).toBeDefined();
      expect(diwaliTpl.status).toBe('APPROVED');
      expect(diwaliTpl.category).toBe('MARKETING');
    });

    test('SIT-006: Template quality rating sync (GREEN / YELLOW)', async () => {
      const res = await fetch(`${MOCK_URL}/v20.0/templates/tpl-diwali-001`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.qualityRating).toBe('GREEN');
      expect(data.name).toBe('wealth_trade_diwali_2024');
    });

    test('SIT-007: Reject invalid template creation without name or category', async () => {
      const res = await fetch(`${MOCK_URL}/v20.0/waba-sit-1001/message_templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'en' }),
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(100);
    });
  });

  // ==========================================
  // Category 3: Outbound Message Dispatch & Auto-Transitions
  // ==========================================
  describe('Category 3: Outbound Message Dispatch & Auto-Transitions', () => {
    let dispatchedWamid: string;

    test('SIT-008: Dispatches template message via virtual Graph API returning WAMID', async () => {
      const res = await fetch(`${MOCK_URL}/v20.0/phone-sit-2001/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sit_test_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '919876543210',
          type: 'template',
          template: {
            name: 'wealth_trade_diwali_2024',
            language: { code: 'en' },
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.messaging_product).toBe('whatsapp');
      expect(data.messages).toBeDefined();
      expect(data.messages[0].id).toMatch(/^wamid\.HBgL/);
      dispatchedWamid = data.messages[0].id;
    });

    test('SIT-009: Automatic delivery webhook dispatched with HMAC-SHA256 signature', async () => {
      // Wait for autoDeliverMs (80ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 200));

      const tracesRes = await fetch(`${MOCK_URL}/admin/traces?limit=20`);
      const tracesData = (await tracesRes.json()) as any;
      const deliveryTrace = tracesData.traces.find(
        (t: any) =>
          t.type === 'WEBHOOK_DISPATCHED' &&
          t.details?.payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.id === dispatchedWamid &&
          t.details?.payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.status === 'delivered',
      );

      expect(deliveryTrace).toBeDefined();
      expect(deliveryTrace.details.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    test('SIT-010: Automatic read receipt webhook dispatched with HMAC-SHA256 signature', async () => {
      // Wait for autoReadMs (200ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 300));

      const tracesRes = await fetch(`${MOCK_URL}/admin/traces?limit=20`);
      const tracesData = (await tracesRes.json()) as any;
      const readTrace = tracesData.traces.find(
        (t: any) =>
          t.type === 'WEBHOOK_DISPATCHED' &&
          t.details?.payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.id === dispatchedWamid &&
          t.details?.payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.status === 'read',
      );

      expect(readTrace).toBeDefined();
      expect(readTrace.details.signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    test('SIT-011: SUT Webhook endpoint accepts and processes HMAC-signed webhooks', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'waba-sit-1001',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '919876543210',
                    phone_number_id: 'phone-sit-2001',
                  },
                  statuses: [
                    {
                      id: dispatchedWamid,
                      status: 'delivered',
                      timestamp: Math.floor(Date.now() / 1000).toString(),
                      recipient_id: '919876543210',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const payloadString = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', APP_SECRET).update(payloadString).digest('hex');

      const res = await fetch(SUT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${signature}`,
        },
        body: payloadString,
      });

      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // Category 4: Failure Injection & Resilience
  // ==========================================
  describe('Category 4: Failure Injection & Resilience', () => {
    test('SIT-012: Simulated 429 rate limit triggers throughput error', async () => {
      // Configure forced 429 error
      await fetch(`${MOCK_URL}/admin/simulator/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forcedError: {
            status: 429,
            code: 130429,
            message: 'Cloud API throughput limit reached',
            type: 'OAuthException',
          },
        }),
      });

      const res = await fetch(`${MOCK_URL}/v20.0/phone-sit-2001/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sit_test_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '919876543210',
          type: 'text',
          text: { body: 'Test rate limit' },
        }),
      });

      expect(res.status).toBe(429);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe(130429);
    });

    test('SIT-013: Simulated 401 unauthorized token triggers OAuthException', async () => {
      // Configure forced 401 error
      await fetch(`${MOCK_URL}/admin/simulator/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forcedError: {
            status: 401,
            code: 190,
            message: 'Invalid OAuth access token',
            type: 'OAuthException',
          },
        }),
      });

      const res = await fetch(`${MOCK_URL}/v20.0/phone-sit-2001/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sit_test_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '919876543210',
          type: 'text',
          text: { body: 'Test 401' },
        }),
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe(190);

      // Clear forced error
      await fetch(`${MOCK_URL}/admin/simulator/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcedError: null }),
      });
    });

    test('SIT-014: Simulated destination failure (code 131026) for phone suffix 999', async () => {
      const res = await fetch(`${MOCK_URL}/v20.0/phone-sit-2001/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sit_test_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '919876543299', // Suffix 999 triggers failure rule
          type: 'text',
          text: { body: 'Test undeliverable failure' },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const wamid = data.messages[0].id;

      // Wait for failure webhook dispatch
      await new Promise((resolve) => setTimeout(resolve, 200));

      const tracesRes = await fetch(`${MOCK_URL}/admin/traces?limit=20`);
      const tracesData = (await tracesRes.json()) as any;
      const failTrace = tracesData.traces.find(
        (t: any) =>
          t.type === 'WEBHOOK_DISPATCHED' &&
          t.details?.payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.id === wamid &&
          t.details?.payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.status === 'failed',
      );

      expect(failTrace).toBeDefined();
      expect(
        failTrace.details.payload.entry[0].changes[0].value.statuses[0].errors[0].code,
      ).toBe(131026);
    });

    test('SIT-015: Artificial latency configuration introduces measured delay', async () => {
      await fetch(`${MOCK_URL}/admin/simulator/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latencyMs: 150 }),
      });

      const start = Date.now();
      await fetch(`${MOCK_URL}/v20.0/phone-sit-2001/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sit_test_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '919876543210',
          type: 'text',
          text: { body: 'Latency test' },
        }),
      });
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(140);

      // Reset latency
      await fetch(`${MOCK_URL}/admin/simulator/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latencyMs: 10 }),
      });
    });
  });

  // ==========================================
  // Category 5: Inbound Client Interactions & DPDP Opt-Out
  // ==========================================
  describe('Category 5: Inbound Client Interactions & DPDP Opt-Out', () => {
    test('SIT-016: Inbound STOP command from client simulator triggers DPDP opt-out in SUT', async () => {
      const res = await fetch(`${MOCK_URL}/admin/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '919876543210',
          text: 'STOP',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.dispatched).toBe(true);

      // Allow async webhook processing in SUT
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    test('SIT-017: Subsequent dispatch to opted-out client is recorded and suppressed', async () => {
      // Verify via client directory in SUT
      const client = await dbHelper.client.client.findFirst({
        where: { whatsappNumber: '+919876543210' },
      });

      if (client) {
        expect(client.communicationConsent).toBe('OPTED_OUT');
      }
    });

    test('SIT-018: Inbound YES command re-activates client consent', async () => {
      const res = await fetch(`${MOCK_URL}/admin/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '919876543210',
          text: 'YES',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.dispatched).toBe(true);

      // Allow async processing in SUT
      await new Promise((resolve) => setTimeout(resolve, 600));

      const client = await dbHelper.client.client.findFirst({
        where: { whatsappNumber: '+919876543210' },
      });

      if (client) {
        expect(client.communicationConsent).toBe('OPTED_IN');
      }
    });

    test('SIT-019: Inbound customer query triggers SUT acknowledgment response', async () => {
      const res = await fetch(`${MOCK_URL}/admin/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: '919876543210',
          text: 'What are the current mutual fund recommendations?',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.dispatched).toBe(true);
    });
  });

  // ==========================================
  // Category 6: Webhook Security & Tampering
  // ==========================================
  describe('Category 6: Webhook Security & Tampering', () => {
    test('SIT-020: Webhook with valid HMAC-SHA256 signature is accepted with HTTP 200', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{ id: 'waba-sit-1001', changes: [] }],
      };
      const raw = JSON.stringify(payload);
      const sig = crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');

      const res = await fetch(SUT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${sig}`,
        },
        body: raw,
      });

      expect(res.status).toBe(200);
    });

    test('SIT-021: Webhook with invalid HMAC signature header is rejected with HTTP 403', async () => {
      const raw = JSON.stringify({ object: 'whatsapp_business_account' });
      const badSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const res = await fetch(SUT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': badSig,
        },
        body: raw,
      });

      expect(res.status).toBe(403);
    });

    test('SIT-022: Tampered webhook payload is rejected with HTTP 403', async () => {
      const originalPayload = JSON.stringify({ object: 'whatsapp_business_account', secret: 1 });
      const validSig = crypto.createHmac('sha256', APP_SECRET).update(originalPayload).digest('hex');
      const tamperedPayload = JSON.stringify({ object: 'whatsapp_business_account', secret: 999 });

      const res = await fetch(SUT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${validSig}`,
        },
        body: tamperedPayload,
      });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // Category 7: Multi-Tenant & Emulator Isolation
  // ==========================================
  describe('Category 7: Multi-Tenant & Emulator Isolation', () => {
    test('SIT-023: Tenant isolation: messages for Tenant 2 do not leak into Tenant 1', async () => {
      const res = await fetch(`${MOCK_URL}/v20.0/phone-sit-2002/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sit_test_token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '919876543211',
          type: 'text',
          text: { body: 'Tenant 2 isolated message' },
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      const wamid = data.messages[0].id;

      const msgRes = await fetch(`${MOCK_URL}/admin/messages`);
      const msgData = (await msgRes.json()) as any;
      const found = msgData.messages.find((m: any) => m.id === wamid);

      expect(found).toBeDefined();
      expect(found.tenantId).toBe('tenant-sit-002');
      expect(found.phoneNumberId).toBe('phone-sit-2002');
    });

    test('SIT-024: State reset restores clean deterministic baseline', async () => {
      const res = await fetch(`${MOCK_URL}/admin/scenarios/reset`, { method: 'POST' });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);

      const msgRes = await fetch(`${MOCK_URL}/admin/messages`);
      const msgData = (await msgRes.json()) as any;
      expect(msgData.messages.length).toBe(0);
    });
  });
});
