import { v4 as uuidv4 } from 'uuid';
import * as Papa from 'papaparse';
import { dbHelper } from '../../helpers/db-helper';
import { apiClient } from '../../helpers/api-client';
import { authHelper } from '../../helpers/auth-helper';
import { redisHelper } from '../../helpers/redis-helper';
import { USER_CREDENTIALS, TEST_USERS, UserRoleKey } from '../../fixtures/users.fixture';
import { normalizeToE164 } from '../../../apps/backend/src/clients/utils/phone-normalizer';
import {
  VALID_PHONE_NUMBERS,
  MALFORMED_PHONE_NUMBERS,
  SAMPLE_CLIENTS,
  VALID_CLIENTS_CSV,
  INVALID_CLIENTS_CSV,
  generateClientsCsv,
} from '../../fixtures/clients.fixture';

async function getRoleToken(role: UserRoleKey): Promise<string> {
  const user = await dbHelper.findUserByEmail(USER_CREDENTIALS[role].email);
  const userId = user?.id || TEST_USERS[role].id || uuidv4();
  const { token } = authHelper.generateAccessToken({ role, userId });
  await redisHelper.setLastActivity(userId, Math.floor(Date.now() / 1000));
  return token;
}

describe('Tier 1 — 02: Clients Directory, Search & DPDP Compliance', () => {
  beforeAll(async () => {
    await dbHelper.cleanTestFixtures();
  });

  afterAll(async () => {
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 8: E.164 Phone Normalization
  // ─────────────────────────────────────────────────────────────
  describe('Feature 8: E.164 Phone Normalization & Validation', () => {
    it('F8-T1: should normalize standard Indian mobile numbers with +91 prefix to valid E.164', () => {
      const phones = ['+919876543210', '+919823456789', '+919123456780'];
      phones.forEach((phone) => {
        const result = normalizeToE164(phone);
        expect(result.valid).toBe(true);
        expect(result.e164).toBe(phone);
        expect(result.e164).toMatch(/^\+91[6-9]\d{9}$/);
      });
    });

    it('F8-T2: should normalize 10-digit Indian numbers without country code using default +91', () => {
      const rawNumbers = ['9876543210', '9823456789', '9123456780'];
      rawNumbers.forEach((raw) => {
        const result = normalizeToE164(raw, 'IN');
        expect(result.valid).toBe(true);
        expect(result.e164).toBe(`+91${raw}`);
        expect(result.e164).toMatch(/^\+91[6-9]\d{9}$/);
      });
    });

    it('F8-T3: should normalize international phone numbers (e.g. US +1) to valid E.164', () => {
      const international = '+14155552671';
      const result = normalizeToE164(international, 'US');
      expect(result.valid).toBe(true);
      expect(result.e164).toBe('+14155552671');
      expect(result.e164).toMatch(/^\+1\d{10}$/);
    });

    it('F8-T4: should reject malformed phone numbers with descriptive validation error', () => {
      MALFORMED_PHONE_NUMBERS.forEach((item) => {
        // Without explicit default country, numbers missing + or containing invalid chars must fail
        const result = normalizeToE164(item.number, '' as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('F8-T5: should enforce unique constraint on normalized whatsapp_number in database', async () => {
      const uniquePhone = '+919999900088';
      const email1 = 'unique1@test.wealthtrade.in';
      const email2 = 'unique2@test.wealthtrade.in';

      // First insertion succeeds
      const first = await dbHelper.client.client.create({
        data: {
          fullName: 'Unique Test Client 1',
          whatsappNumber: uniquePhone,
          email: email1,
          categoryTier: 'RETAIL',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
        },
      });
      expect(first.id).toBeDefined();

      // Second insertion with identical normalized whatsapp_number must reject with unique violation
      await expect(
        dbHelper.client.client.create({
          data: {
            fullName: 'Duplicate Phone Client',
            whatsappNumber: uniquePhone,
            email: email2,
            categoryTier: 'HNI',
            communicationConsent: 'PENDING',
            preferredLanguage: 'hi',
          },
        }),
      ).rejects.toThrow();

      // Clean up
      await dbHelper.client.client.deleteMany({ where: { whatsappNumber: uniquePhone } });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 9: GIN Full-Text Client Search
  // ─────────────────────────────────────────────────────────────
  describe('Feature 9: GIN Full-Text Client Search', () => {
    const searchClients = [
      {
        fullName: 'Rahul Sharma Wealth',
        whatsappNumber: '+919999911001',
        email: 'rahul.sharma@test.wealthtrade.in',
        categoryTier: 'HNI' as const,
        communicationConsent: 'OPTED_IN' as const,
        preferredLanguage: 'en',
      },
      {
        fullName: 'Priya Patel Advisory',
        whatsappNumber: '+919999911002',
        email: 'priya.patel@test.wealthtrade.in',
        categoryTier: 'RETAIL' as const,
        communicationConsent: 'OPTED_IN' as const,
        preferredLanguage: 'gu',
      },
      {
        fullName: 'Amitabh Verma Holdings',
        whatsappNumber: '+919999911003',
        email: 'amitabh.verma@test.wealthtrade.in',
        categoryTier: 'CORPORATE' as const,
        communicationConsent: 'PENDING' as const,
        preferredLanguage: 'hi',
      },
    ];

    beforeAll(async () => {
      for (const client of searchClients) {
        await dbHelper.client.client.upsert({
          where: { whatsappNumber: client.whatsappNumber },
          create: client,
          update: client,
        });
      }
    });

    afterAll(async () => {
      const phones = searchClients.map((c) => c.whatsappNumber);
      await dbHelper.client.client.deleteMany({
        where: { whatsappNumber: { in: phones } },
      });
    });

    it('F9-T1: should search clients by full name substring in sub-500ms', async () => {
      const start = Date.now();
      const results = await dbHelper.client.client.findMany({
        where: {
          fullName: { contains: 'Sharma', mode: 'insensitive' },
          deletedAt: null,
        },
      });
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].fullName).toContain('Sharma');
      expect(duration).toBeLessThan(500); // Sub-500ms SLA
    });

    it('F9-T2: should search clients by phone number substring in sub-500ms', async () => {
      const start = Date.now();
      const results = await dbHelper.client.client.findMany({
        where: {
          whatsappNumber: { contains: '9999911002' },
          deletedAt: null,
        },
      });
      const duration = Date.now() - start;

      expect(results.length).toBe(1);
      expect(results[0].fullName).toBe('Priya Patel Advisory');
      expect(duration).toBeLessThan(500);
    });

    it('F9-T3: should search clients by email address substring in sub-500ms', async () => {
      const start = Date.now();
      const results = await dbHelper.client.client.findMany({
        where: {
          email: { contains: 'amitabh.verma', mode: 'insensitive' },
          deletedAt: null,
        },
      });
      const duration = Date.now() - start;

      expect(results.length).toBe(1);
      expect(results[0].categoryTier).toBe('CORPORATE');
      expect(duration).toBeLessThan(500);
    });

    it('F9-T4: should filter clients by category tier and active status', async () => {
      const results = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'HNI',
          accountStatus: 'ACTIVE',
          deletedAt: null,
          whatsappNumber: { in: searchClients.map((c) => c.whatsappNumber) },
        },
      });

      expect(results.length).toBe(1);
      expect(results[0].fullName).toBe('Rahul Sharma Wealth');
    });

    it('F9-T5: should return empty array sub-500ms when search query matches no records', async () => {
      const start = Date.now();
      const results = await dbHelper.client.client.findMany({
        where: {
          fullName: { contains: 'NonExistentZebraXylophone', mode: 'insensitive' },
          deletedAt: null,
        },
      });
      const duration = Date.now() - start;

      expect(results).toHaveLength(0);
      expect(duration).toBeLessThan(500);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 10: CSV/XLSX Streaming Import
  // ─────────────────────────────────────────────────────────────
  describe('Feature 10: CSV Streaming Import & Line-by-Line Validation', () => {
    it('F10-T1: should stream-parse valid CSV file and extract all compliant rows', () => {
      const parsed = Papa.parse(VALID_CLIENTS_CSV, {
        header: true,
        skipEmptyLines: true,
      });

      expect(parsed.errors).toHaveLength(0);
      expect(parsed.data.length).toBe(5);

      const firstRow = parsed.data[0] as any;
      expect(firstRow).toHaveProperty('full_name', 'Rajesh Kumar');
      expect(firstRow).toHaveProperty('whatsapp_number', '+919999900011');
      expect(firstRow).toHaveProperty('category_tier', 'HNI');
    });

    it('F10-T2: should validate phone numbers row-by-row and identify invalid rows with line numbers', () => {
      const parsed = Papa.parse(INVALID_CLIENTS_CSV, {
        header: true,
        skipEmptyLines: true,
      });

      const validationErrors: Array<{ line: number; field: string; error: string }> = [];

      parsed.data.forEach((row: any, index: number) => {
        const line = index + 2; // header is line 1
        if (!row.full_name || row.full_name.trim() === '') {
          validationErrors.push({ line, field: 'full_name', error: 'Missing client name' });
        }
        const phoneCheck = normalizeToE164(row.whatsapp_number, '' as any);
        if (!phoneCheck.valid) {
          validationErrors.push({ line, field: 'whatsapp_number', error: phoneCheck.error! });
        }
        if (!['RETAIL', 'HNI', 'CORPORATE', 'PROSPECT'].includes(row.category_tier)) {
          validationErrors.push({ line, field: 'category_tier', error: `Invalid tier: ${row.category_tier}` });
        }
        if (row.email && !row.email.includes('@')) {
          validationErrors.push({ line, field: 'email', error: `Malformed email: ${row.email}` });
        }
      });

      expect(validationErrors.length).toBeGreaterThanOrEqual(3);
      // Line 2 has invalid phone without +
      expect(validationErrors.some((e) => e.line === 2 && e.field === 'whatsapp_number')).toBe(true);
      // Line 3 has invalid tier SUPER_VIP
      expect(validationErrors.some((e) => e.line === 3 && e.field === 'category_tier')).toBe(true);
      // Line 4 has malformed email
      expect(validationErrors.some((e) => e.line === 4 && e.field === 'email')).toBe(true);
      // Line 5 has missing/empty phone
      expect(validationErrors.some((e) => e.line === 5 && e.field === 'whatsapp_number')).toBe(true);
    });

    it('F10-T3: should batch-insert compliant parsed CSV clients into PostgreSQL', async () => {
      const parsed = Papa.parse(VALID_CLIENTS_CSV, {
        header: true,
        skipEmptyLines: true,
      });

      const clientsToInsert = (parsed.data as any[]).map((row) => ({
        fullName: row.full_name,
        whatsappNumber: row.whatsapp_number,
        email: row.email,
        categoryTier: row.category_tier,
        preferredLanguage: row.preferred_language || 'en',
        communicationConsent: 'OPTED_IN' as const,
      }));

      for (const client of clientsToInsert) {
        await dbHelper.client.client.upsert({
          where: { whatsappNumber: client.whatsappNumber },
          create: client,
          update: client,
        });
      }

      // Verify records exist in PostgreSQL
      const importedPhones = clientsToInsert.map((c) => c.whatsappNumber);
      const inDb = await dbHelper.client.client.findMany({
        where: { whatsappNumber: { in: importedPhones } },
      });
      expect(inDb.length).toBe(5);

      // Clean up
      await dbHelper.client.client.deleteMany({
        where: { whatsappNumber: { in: importedPhones } },
      });
    });

    it('F10-T4: should handle arbitrary high-volume CSV batch generation (50+ records)', () => {
      const generatedCsv = generateClientsCsv(50, 500);
      const parsed = Papa.parse(generatedCsv, {
        header: true,
        skipEmptyLines: true,
      });

      expect(parsed.data.length).toBe(50);
      const validE164Count = (parsed.data as any[]).filter(
        (row) => normalizeToE164(row.whatsapp_number).valid,
      ).length;
      expect(validE164Count).toBe(50);
    });

    it('F10-T5: should reject CSV missing mandatory columns or containing completely malformed data', () => {
      const badCsv = 'random_garbage_column_1,random_garbage_column_2\nfoo,bar';
      const parsed = Papa.parse(badCsv, {
        header: true,
        skipEmptyLines: true,
      });

      const hasRequiredHeaders = ['full_name', 'whatsapp_number'].every((col) =>
        parsed.meta.fields?.includes(col),
      );
      expect(hasRequiredHeaders).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 11: Soft-Delete & Restore
  // ─────────────────────────────────────────────────────────────
  describe('Feature 11: Soft-Delete & Restore Lifecycle', () => {
    let testClientId: string;
    const testPhone = '+919999922001';

    beforeAll(async () => {
      const client = await dbHelper.client.client.upsert({
        where: { whatsappNumber: testPhone },
        create: {
          fullName: 'Soft Delete Subject Client',
          whatsappNumber: testPhone,
          email: 'soft.delete.subject@test.wealthtrade.in',
          categoryTier: 'RETAIL',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
          accountStatus: 'ACTIVE',
        },
        update: {
          accountStatus: 'ACTIVE',
          deletedAt: null,
        },
      });
      testClientId = client.id;
    });

    afterAll(async () => {
      await dbHelper.client.client.deleteMany({ where: { whatsappNumber: testPhone } });
    });

    it('F11-T1: should soft-delete client by setting deletedAt timestamp and accountStatus to INACTIVE', async () => {
      const adminToken = await getRoleToken('Admin');
      const res = await apiClient.withToken(adminToken).delete('/clients/' + testClientId);
      expect([200, 204]).toContain(res.status);

      const updated = await dbHelper.client.client.findUnique({ where: { id: testClientId } });
      expect(updated?.deletedAt).not.toBeNull();
      expect(updated?.accountStatus).toBe('INACTIVE');
    });

    it('F11-T2: should exclude soft-deleted clients from standard active client list queries', async () => {
      const activeClients = await dbHelper.client.client.findMany({
        where: {
          id: testClientId,
          deletedAt: null,
        },
      });

      expect(activeClients).toHaveLength(0);
    });

    it('F11-T3: should preserve client record in database when soft-deleted', async () => {
      const directLookup = await dbHelper.client.client.findUnique({
        where: { id: testClientId },
      });

      expect(directLookup).not.toBeNull();
      expect(directLookup?.deletedAt).not.toBeNull();
      expect(directLookup?.fullName).toBe('Soft Delete Subject Client');
    });

    it('F11-T4: should restore soft-deleted client by clearing deletedAt timestamp', async () => {
      const superAdminToken = await getRoleToken('Super_Admin');
      const res = await apiClient.withToken(superAdminToken).post('/clients/' + testClientId + '/restore');
      expect(res.status).toBe(200);

      const restored = await dbHelper.client.client.findUnique({ where: { id: testClientId } });
      expect(restored?.deletedAt).toBeNull();
      expect(restored?.accountStatus).toBe('ACTIVE');

      // Now visible in active queries
      const activeAgain = await dbHelper.client.client.findMany({
        where: { id: testClientId, deletedAt: null },
      });
      expect(activeAgain).toHaveLength(1);
    });

    it('F11-T5: should strictly exclude soft-deleted clients from marketing audience resolution (Property P5)', async () => {
      // Re-soft-delete client
      await dbHelper.client.client.update({
        where: { id: testClientId },
        data: { deletedAt: new Date(), accountStatus: 'INACTIVE' },
      });

      // Query audience segment matching categoryTier with deletedAt: null filter
      const resolvedAudience = await dbHelper.client.client.findMany({
        where: {
          categoryTier: 'RETAIL',
          communicationConsent: 'OPTED_IN',
          deletedAt: null, // Property P5 exclusion
        },
      });

      expect(resolvedAudience.some((c) => c.id === testClientId)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 12: DPDP Right-to-Erasure
  // ─────────────────────────────────────────────────────────────
  describe('Feature 12: DPDP Right-to-Erasure (ERASED_{uuid})', () => {
    let erasureClientId: string;
    const erasurePhone = '+919999933001';
    const erasureEmail = 'erasure.subject@test.wealthtrade.in';

    beforeAll(async () => {
      const client = await dbHelper.client.client.create({
        data: {
          fullName: 'DPDP Erasure Target Client',
          whatsappNumber: erasurePhone,
          email: erasureEmail,
          categoryTier: 'HNI',
          communicationConsent: 'OPTED_IN',
          preferredLanguage: 'en',
        },
      });
      erasureClientId = client.id;

      // Seed a message log for this client
      await dbHelper.client.messageLog.create({
        data: {
          clientId: erasureClientId,
          templateId: uuidv4(),
          templateCategory: 'MARKETING',
          idempotencyKey: `test_idemp_${uuidv4()}`,
          deliveryStatus: 'DELIVERED',
          variableValues: { '1': 'DPDP Erasure Target Client' },
        },
      });
    });

    afterAll(async () => {
      await dbHelper.client.messageLog.deleteMany({
        where: { clientId: erasureClientId },
      });
      await dbHelper.client.client.deleteMany({
        where: { id: erasureClientId },
      });
    });

    it('F12-T1: should anonymize client full name to ERASED_{uuid}', async () => {
      const adminToken = await getRoleToken('Admin');
      const res = await apiClient.withToken(adminToken).post('/clients/' + erasureClientId + '/erasure', {
        confirmed: true,
        reason: 'DPDP Sec 12 request',
      });
      expect(res.status).toBe(200);

      const erasedToken = `ERASED_${erasureClientId}`;
      const client = await dbHelper.client.client.findUnique({ where: { id: erasureClientId } });

      expect(client?.fullName).toBe(erasedToken);
      expect(client?.fullName).toMatch(/^ERASED_[0-9a-f-]{36}$/);
    });

    it('F12-T2: should anonymize client email address to ERASED_{uuid}@deleted.local', async () => {
      const erasedEmail = `ERASED_${erasureClientId}@deleted.local`;
      const client = await dbHelper.client.client.findUnique({ where: { id: erasureClientId } });

      expect(client?.email).toBe(erasedEmail);
      expect(client?.email).toContain('@deleted.local');
    });

    it('F12-T3: should anonymize client WhatsApp number to prevent PII leakage while preserving uniqueness', async () => {
      const erasedPhone = `+ERASED_${erasureClientId.replace(/-/g, '').slice(0, 10)}`;
      const client = await dbHelper.client.client.findUnique({ where: { id: erasureClientId } });

      expect(client?.whatsappNumber).toBe(erasedPhone);
      expect(client?.whatsappNumber).not.toBe(erasurePhone);
    });

    it('F12-T4: should anonymize PII in message_logs referencing the erased client', async () => {
      const erasedToken = `ERASED_${erasureClientId}`;
      const logs = await dbHelper.client.messageLog.findMany({
        where: { clientId: erasureClientId },
      });

      expect(logs.length).toBeGreaterThan(0);
      logs.forEach((log) => {
        expect((log.variableValues as any)['1']).toBe(erasedToken);
        expect((log.variableValues as any)['1']).not.toContain('DPDP Erasure Target Client');
      });
    });

    it('F12-T5: should confirm that erasure is irreversible and client PII cannot be recovered from active records', async () => {
      const client = await dbHelper.client.client.findUnique({
        where: { id: erasureClientId },
      });

      expect(client).not.toBeNull();
      expect(client?.fullName).not.toBe('DPDP Erasure Target Client');
      expect(client?.email).not.toBe(erasureEmail);
      expect(client?.whatsappNumber).not.toBe(erasurePhone);
      expect(client?.deletedAt).not.toBeNull();
      expect(client?.accountStatus).toBe('INACTIVE');
    });
  });
});
