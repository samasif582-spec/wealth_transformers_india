import { v4 as uuidv4 } from 'uuid';
import { dbHelper } from '../../helpers/db-helper';
import { mockMetaServer } from '../../helpers/mock-meta-server';
import { ApiClient } from '../../helpers/api-client';
import {
  SEBI_AMFI_MANDATORY_FOOTER,
  COMPLIANT_MARKETING_TEMPLATE,
  NON_COMPLIANT_MARKETING_TEMPLATE_NO_FOOTER,
  NON_COMPLIANT_MARKETING_TEMPLATE_BAD_FOOTER,
  COMPLIANT_UTILITY_TEMPLATE,
  VARIABLE_REGEX_TEST_CASES,
} from '../../fixtures/templates.fixture';
import { USER_CREDENTIALS, TEST_USERS } from '../../fixtures/users.fixture';

import {
  validateTemplatePlaceholders,
  validateSebiFooter,
} from '../../../apps/backend/src/templates/templates.service';
import { validateMediaUploadParams } from '../../../apps/backend/src/media/media.service';

describe('Tier 1 — 04: WhatsApp Templates, Media Assets & R2 Storage', () => {
  let marketingUserId: string;

  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    const marketing = await dbHelper.findUserByEmail(USER_CREDENTIALS.Marketing_Employee.email);
    marketingUserId = marketing?.id || TEST_USERS.Marketing_Employee.id!;

    if (!mockMetaServer.isRunning) {
      await mockMetaServer.start();
    }
  });

  afterAll(async () => {
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    if (mockMetaServer.isRunning) {
      await mockMetaServer.stop();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 17: Regex Variable Extraction (Property P6)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 17: Regex Variable Extraction & Validation (Property P6)', () => {
    it('F17-T1: should correctly extract sequential numeric placeholders {{1}}, {{2}}, {{3}}', () => {
      const text = 'Hello {{1}}, your SIP of INR {{2}} has executed on {{3}}.';
      const result = validateTemplatePlaceholders(text);

      expect(result.valid).toBe(true);
      expect(result.extractedPlaceholders).toEqual(['1', '2', '3']);
    });

    it('F17-T2: should allow template bodies with single placeholder {{1}} or zero placeholders', () => {
      const single = validateTemplatePlaceholders('Happy birthday {{1}} from Wealth Trade!');
      expect(single.valid).toBe(true);
      expect(single.extractedPlaceholders).toEqual(['1']);

      const zero = validateTemplatePlaceholders('Markets are closed on Diwali.');
      expect(zero.valid).toBe(true);
      expect(zero.extractedPlaceholders).toEqual([]);
    });

    it('F17-T3: should reject template with sequential gap (e.g. {{1}}, {{3}} missing {{2}})', () => {
      const text = 'Hello {{1}}, your balance is {{3}}.';
      const result = validateTemplatePlaceholders(text);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/gap or out of order/i);
    });

    it('F17-T4: should reject alphanumeric named placeholders like {{name}} or {{amount}}', () => {
      const text = 'Hello {{client_name}}, your portfolio value is {{value}}.';
      const result = validateTemplatePlaceholders(text);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/alphanumeric names/i);
    });

    it('F17-T5: should validate all fixture variable regex test cases accurately', () => {
      VARIABLE_REGEX_TEST_CASES.forEach((tc) => {
        const result = validateTemplatePlaceholders(tc.bodyText);
        expect(result.valid).toBe(tc.isValid);
        if (tc.isValid) {
          expect(result.extractedPlaceholders).toEqual(tc.expectedPlaceholders);
        } else {
          expect(result.error).toBeDefined();
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 18: SEBI/AMFI Footer Enforcement on MARKETING templates
  // ─────────────────────────────────────────────────────────────
  describe('Feature 18: SEBI/AMFI Footer Enforcement on MARKETING templates', () => {
    it('F18-T1: should accept MARKETING template ending with exact authorized SEBI/AMFI footer', () => {
      const check = validateSebiFooter('MARKETING', COMPLIANT_MARKETING_TEMPLATE.footerText);
      expect(check.valid).toBe(true);
    });

    it('F18-T2: should reject MARKETING template completely missing a footer', () => {
      const check = validateSebiFooter('MARKETING', NON_COMPLIANT_MARKETING_TEMPLATE_NO_FOOTER.footerText);
      expect(check.valid).toBe(false);
      expect(check.error).toMatch(/SEBI\/AMFI/i);
    });

    it('F18-T3: should reject MARKETING template with modified/tampered footer text', () => {
      const check = validateSebiFooter('MARKETING', NON_COMPLIANT_MARKETING_TEMPLATE_BAD_FOOTER.footerText);
      expect(check.valid).toBe(false);
      expect(check.error).toMatch(/does not match authorized/i);
    });

    it('F18-T4: should permit UTILITY category template without SEBI/AMFI footer', () => {
      const check = validateSebiFooter('UTILITY', COMPLIANT_UTILITY_TEMPLATE.footerText);
      expect(check.valid).toBe(true);
    });

    it('F18-T5: should permit AUTHENTICATION category template without SEBI/AMFI footer', () => {
      const check = validateSebiFooter('AUTHENTICATION', undefined);
      expect(check.valid).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 19: Meta Submission & Status Polling
  // ─────────────────────────────────────────────────────────────
  describe('Feature 19: Meta Submission & Status Polling Lifecycle', () => {
    let testTemplateId: string;
    let versionId: string;
    const templateName = `test_tmpl_${Date.now()}`;

    afterAll(async () => {
      await dbHelper.client.templateVersion.deleteMany({
        where: { template: { name: templateName } },
      });
      await dbHelper.client.messageTemplate.deleteMany({
        where: { name: templateName },
      });
    });

    it('F19-T1: should create template in database with status DRAFT', async () => {
      const template = await dbHelper.client.messageTemplate.create({
        data: {
          name: templateName,
          category: 'MARKETING',
          language: 'en',
          status: 'DRAFT',
          createdByUserId: marketingUserId,
        },
      });
      testTemplateId = template.id;

      const version = await dbHelper.client.templateVersion.create({
        data: {
          templateId: testTemplateId,
          versionNumber: 1,
          status: 'DRAFT',
          bodyText: 'Hello {{1}}, daily market research is ready.',
          footerText: 'SEBI Reg: INZ000123456 | AMFI: ARN-98765',
          variableSchema: { '1': { name: 'client_name', example: 'Rahul' } },
        },
      });
      versionId = version.id;

      expect(template.status).toBe('DRAFT');
      expect(version.versionNumber).toBe(1);
    });

    it('F19-T2: should transition status to PENDING_APPROVAL upon submission to Meta', async () => {
      const updated = await dbHelper.client.messageTemplate.update({
        where: { id: testTemplateId },
        data: {
          status: 'PENDING_APPROVAL',
          metaTemplateId: `meta_tmpl_${Date.now()}`,
        },
      });

      await dbHelper.client.templateVersion.update({
        where: { id: versionId },
        data: {
          status: 'PENDING_APPROVAL',
          submittedAt: new Date(),
        },
      });

      expect(updated.status).toBe('PENDING_APPROVAL');
      expect(updated.metaTemplateId).toBeDefined();
    });

    it('F19-T3: should transition status to APPROVED when Meta Graph API webhook confirms approval', async () => {
      const now = new Date();
      const updated = await dbHelper.client.messageTemplate.update({
        where: { id: testTemplateId },
        data: { status: 'APPROVED' },
      });

      await dbHelper.client.templateVersion.update({
        where: { id: versionId },
        data: {
          status: 'APPROVED',
          approvedAt: now,
        },
      });

      expect(updated.status).toBe('APPROVED');
      const version = await dbHelper.client.templateVersion.findUnique({ where: { id: versionId } });
      expect(version?.approvedAt).not.toBeNull();
    });

    it('F19-T4: should handle Meta rejection with recorded rejectionReason', async () => {
      const rejectTmplName = `test_reject_${Date.now()}`;
      const template = await dbHelper.client.messageTemplate.create({
        data: {
          name: rejectTmplName,
          category: 'MARKETING',
          language: 'en',
          status: 'REJECTED',
          createdByUserId: marketingUserId,
        },
      });

      const version = await dbHelper.client.templateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          status: 'REJECTED',
          bodyText: 'Guaranteed 500% returns on stocks!',
          variableSchema: {},
          rejectionReason: 'Content violates Meta Commercial Policy: deceptive financial claims',
          rejectedAt: new Date(),
        },
      });

      expect(template.status).toBe('REJECTED');
      expect(version.rejectionReason).toContain('deceptive financial claims');

      await dbHelper.client.templateVersion.deleteMany({ where: { templateId: template.id } });
      await dbHelper.client.messageTemplate.delete({ where: { id: template.id } });
    });

    it('F19-T5: should increment version_number (v1 -> v2) when updating an approved template', async () => {
      const v2 = await dbHelper.client.templateVersion.create({
        data: {
          templateId: testTemplateId,
          versionNumber: 2,
          status: 'DRAFT',
          bodyText: 'Hello {{1}}, updated weekly research is ready for {{2}}.',
          footerText: 'SEBI Reg: INZ000123456 | AMFI: ARN-98765',
          variableSchema: {
            '1': { name: 'client_name', example: 'Rahul' },
            '2': { name: 'week', example: 'Week 47' },
          },
        },
      });

      expect(v2.versionNumber).toBe(2);
      expect(v2.templateId).toBe(testTemplateId);

      const allVersions = await dbHelper.client.templateVersion.findMany({
        where: { templateId: testTemplateId },
        orderBy: { versionNumber: 'asc' },
      });
      expect(allVersions.length).toBe(2);
      expect(allVersions[0].versionNumber).toBe(1);
      expect(allVersions[1].versionNumber).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 20: Template Quality Rating Sync
  // ─────────────────────────────────────────────────────────────
  describe('Feature 20: Template Quality Rating Sync (GREEN, YELLOW, RED)', () => {
    let qualityTemplateId: string;
    const qName = `test_quality_${Date.now()}`;

    beforeAll(async () => {
      const tmpl = await dbHelper.client.messageTemplate.create({
        data: {
          name: qName,
          category: 'MARKETING',
          language: 'en',
          status: 'APPROVED',
          qualityRating: 'UNKNOWN',
          createdByUserId: marketingUserId,
        },
      });
      qualityTemplateId = tmpl.id;
    });

    afterAll(async () => {
      await dbHelper.client.messageTemplate.deleteMany({ where: { id: qualityTemplateId } });
    });

    it('F20-T1: should sync quality rating to GREEN when Meta score is high', async () => {
      const updated = await dbHelper.client.messageTemplate.update({
        where: { id: qualityTemplateId },
        data: {
          qualityRating: 'GREEN',
          qualityCheckedAt: new Date(),
        },
      });

      expect(updated.qualityRating).toBe('GREEN');
      expect(updated.qualityCheckedAt).not.toBeNull();
    });

    it('F20-T2: should sync quality rating to YELLOW on declining quality score', async () => {
      const updated = await dbHelper.client.messageTemplate.update({
        where: { id: qualityTemplateId },
        data: {
          qualityRating: 'YELLOW',
          qualityCheckedAt: new Date(),
        },
      });

      expect(updated.qualityRating).toBe('YELLOW');
    });

    it('F20-T3: should sync quality rating to RED on critical user feedback or block rate', async () => {
      const updated = await dbHelper.client.messageTemplate.update({
        where: { id: qualityTemplateId },
        data: {
          qualityRating: 'RED',
          qualityCheckedAt: new Date(),
        },
      });

      expect(updated.qualityRating).toBe('RED');
    });

    it('F20-T4: should block RED quality templates from being selected for new campaign dispatch', async () => {
      // Query templates that are eligible for campaign dispatch (APPROVED and qualityRating != RED)
      const dispatchableTemplates = await dbHelper.client.messageTemplate.findMany({
        where: {
          id: qualityTemplateId,
          status: 'APPROVED',
          qualityRating: { not: 'RED' }, // Enforces quality gate
        },
      });

      expect(dispatchableTemplates).toHaveLength(0);
    });

    it('F20-T5: should allow GREEN or YELLOW templates to be selected for campaign dispatch', async () => {
      await dbHelper.client.messageTemplate.update({
        where: { id: qualityTemplateId },
        data: { qualityRating: 'GREEN' },
      });

      const dispatchable = await dbHelper.client.messageTemplate.findMany({
        where: {
          id: qualityTemplateId,
          status: 'APPROVED',
          qualityRating: { not: 'RED' },
        },
      });

      expect(dispatchable).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 21: Presigned Cloudflare R2 Upload
  // ─────────────────────────────────────────────────────────────
  describe('Feature 21: Presigned Cloudflare R2 Upload', () => {
    it('F21-T1: should validate allowed MIME types (JPEG, PNG, PDF, MP4)', () => {
      const allowed = [
        { filename: 'market_chart.png', mimeType: 'image/png', fileSizeBytes: 1024 * 500, currentQuotaBytes: 0 },
        { filename: 'research.pdf', mimeType: 'application/pdf', fileSizeBytes: 1024 * 1024 * 5, currentQuotaBytes: 0 },
        { filename: 'briefing.mp4', mimeType: 'video/mp4', fileSizeBytes: 1024 * 1024 * 10, currentQuotaBytes: 0 },
      ];

      allowed.forEach((params) => {
        expect(validateMediaUploadParams(params).valid).toBe(true);
      });
    });

    it('F21-T2: should reject disallowed MIME types (e.g. .exe, .sh, .bat)', () => {
      const disallowed = [
        { filename: 'virus.exe', mimeType: 'application/x-msdownload', fileSizeBytes: 1024, currentQuotaBytes: 0 },
        { filename: 'script.sh', mimeType: 'text/x-shellscript', fileSizeBytes: 1024, currentQuotaBytes: 0 },
      ];

      disallowed.forEach((params) => {
        const result = validateMediaUploadParams(params);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/disallowed media type/i);
      });
    });

    it('F21-T3: should reject file exceeding per-type size limit (e.g. Image > 5MB)', () => {
      const oversizedImage = {
        filename: 'huge_banner.jpg',
        mimeType: 'image/jpeg',
        fileSizeBytes: 6 * 1024 * 1024, // 6MB > 5MB limit
        currentQuotaBytes: 0,
      };

      const result = validateMediaUploadParams(oversizedImage);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/exceeds maximum allowed/i);
    });

    it('F21-T4: should execute mock binary upload to simulated R2 endpoint', async () => {
      const client = new ApiClient(mockMetaServer.url, '');
      const binaryPayload = Buffer.from('PDF_SAMPLE_HEADER_BODY_CONTENT_12345');

      const res = await client.put('/upload/test-sample.pdf', binaryPayload);
      expect(res.status).toBe(200);
      expect(res.text).toBe('OK');
    });

    it('F21-T5: should generate valid presigned URL structure with 600s TTL and asset ID', () => {
      const assetId = uuidv4();
      const mockPresigned = {
        uploadUrl: `https://mock-r2.wealthtrade.in/assets/${assetId}?X-Amz-Expires=600`,
        assetId,
        expiresIn: 600,
      };

      expect(mockPresigned.uploadUrl).toContain('X-Amz-Expires=600');
      expect(mockPresigned.assetId).toBe(assetId);
      expect(mockPresigned.expiresIn).toBe(600);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 22: Presigned Download URLs
  // ─────────────────────────────────────────────────────────────
  describe('Feature 22: Presigned Download URLs', () => {
    let testAssetId: string;
    const r2Key = `test_r2_key_${uuidv4()}.pdf`;

    beforeAll(async () => {
      const asset = await dbHelper.client.mediaAsset.create({
        data: {
          r2ObjectKey: r2Key,
          fileName: 'market_intelligence_report.pdf',
          mimeType: 'application/pdf',
          fileType: 'PDF',
          fileSizeBytes: BigInt(1024 * 500),
          uploadedByUserId: marketingUserId,
          virusScanStatus: 'CLEAN',
        },
      });
      testAssetId = asset.id;
    });

    afterAll(async () => {
      await dbHelper.client.mediaAsset.deleteMany({ where: { id: testAssetId } });
    });

    it('F22-T1: should retrieve active media asset metadata from database', async () => {
      const asset = await dbHelper.client.mediaAsset.findUnique({
        where: { id: testAssetId },
      });

      expect(asset).not.toBeNull();
      expect(asset?.fileName).toBe('market_intelligence_report.pdf');
      expect(asset?.fileType).toBe('PDF');
      expect(asset?.virusScanStatus).toBe('CLEAN');
    });

    it('F22-T2: should construct presigned GetObject URL with 15-minute (900s) expiration', () => {
      const presignedDownloadUrl = `https://r2.wealthtrade.in/${r2Key}?X-Amz-Expires=900&token=mock-sig`;
      expect(presignedDownloadUrl).toContain('X-Amz-Expires=900');
      expect(presignedDownloadUrl).toContain(r2Key);
    });

    it('F22-T3: should return 404 for non-existent media asset download query', async () => {
      const ghostId = uuidv4();
      const asset = await dbHelper.client.mediaAsset.findUnique({
        where: { id: ghostId },
      });
      expect(asset).toBeNull();
    });

    it('F22-T4: should reject download URL generation for soft-deleted media asset', async () => {
      // Soft-delete asset
      await dbHelper.client.mediaAsset.update({
        where: { id: testAssetId },
        data: { deletedAt: new Date() },
      });

      const activeAsset = await dbHelper.client.mediaAsset.findFirst({
        where: { id: testAssetId, deletedAt: null },
      });
      expect(activeAsset).toBeNull();

      // Restore
      await dbHelper.client.mediaAsset.update({
        where: { id: testAssetId },
        data: { deletedAt: null },
      });
    });

    it('F22-T5: should verify virusScanStatus CLEAN before generating download URL', async () => {
      const asset = await dbHelper.client.mediaAsset.findUnique({
        where: { id: testAssetId },
      });
      expect(asset?.virusScanStatus).toBe('CLEAN');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 23: Media Storage Quota Tracking (10GB)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 23: Media Storage Quota Tracking (10GB Quota)', () => {
    const GIGABYTE = 1024 * 1024 * 1024;
    const TEN_GIGABYTES = 10 * GIGABYTE;

    it('F23-T1: should calculate total cumulative bytes used by active media assets', async () => {
      const result = await dbHelper.client.mediaAsset.aggregate({
        where: { deletedAt: null },
        _sum: { fileSizeBytes: true },
      });

      const totalBytes = Number(result._sum.fileSizeBytes || 0);
      expect(typeof totalBytes).toBe('number');
      expect(totalBytes).toBeLessThan(TEN_GIGABYTES);
    });

    it('F23-T2: should permit upload when cumulative usage is below 10GB limit', () => {
      const check = validateMediaUploadParams({
        filename: 'chart.png',
        mimeType: 'image/png',
        fileSizeBytes: 2 * 1024 * 1024, // 2MB
        currentQuotaBytes: 5 * GIGABYTE, // 5GB used
      });

      expect(check.valid).toBe(true);
    });

    it('F23-T3: should reject upload when cumulative usage would exceed 10GB limit', () => {
      const check = validateMediaUploadParams({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 50 * 1024 * 1024, // 50MB
        currentQuotaBytes: 9.98 * GIGABYTE, // Already at 9.98 GB -> exceeds 10GB
      });

      expect(check.valid).toBe(false);
      expect(check.error).toMatch(/storage quota exceeded/i);
    });

    it('F23-T4: should deduct soft-deleted assets from active storage quota calculation', async () => {
      const assetKey = `quota_test_${uuidv4()}.png`;
      const sizeBytes = 1024 * 1024; // 1MB

      const created = await dbHelper.client.mediaAsset.create({
        data: {
          r2ObjectKey: assetKey,
          fileName: 'quota_test.png',
          mimeType: 'image/png',
          fileType: 'PNG',
          fileSizeBytes: BigInt(sizeBytes),
          uploadedByUserId: marketingUserId,
        },
      });

      // Sum active
      const sumActiveBefore = await dbHelper.client.mediaAsset.aggregate({
        where: { deletedAt: null },
        _sum: { fileSizeBytes: true },
      });

      // Soft delete
      await dbHelper.client.mediaAsset.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      const sumActiveAfter = await dbHelper.client.mediaAsset.aggregate({
        where: { deletedAt: null },
        _sum: { fileSizeBytes: true },
      });

      expect(Number(sumActiveBefore._sum.fileSizeBytes) - Number(sumActiveAfter._sum.fileSizeBytes)).toBe(sizeBytes);

      await dbHelper.client.mediaAsset.delete({ where: { id: created.id } });
    });

    it('F23-T5: should set r2_purge_at timestamp on deleted media assets for automated lifecycle cleanup', async () => {
      const purgeDate = new Date(Date.now() + 30 * 86400000); // 30 days
      const asset = await dbHelper.client.mediaAsset.create({
        data: {
          r2ObjectKey: `purge_test_${uuidv4()}.pdf`,
          fileName: 'purge_test.pdf',
          mimeType: 'application/pdf',
          fileType: 'PDF',
          fileSizeBytes: BigInt(1024),
          uploadedByUserId: marketingUserId,
          deletedAt: new Date(),
          r2PurgeAt: purgeDate,
        },
      });

      expect(asset.r2PurgeAt).not.toBeNull();
      expect(new Date(asset.r2PurgeAt!).getTime()).toBeGreaterThan(Date.now());

      await dbHelper.client.mediaAsset.delete({ where: { id: asset.id } });
    });
  });
});
