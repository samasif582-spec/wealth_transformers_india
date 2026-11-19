import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TemplatesService } from '../templates.service';
import { MetaTemplatesAdapter } from '../meta-templates.adapter';
import { PrismaService } from '../../prisma/prisma.service';
import { QualityRating, TemplateCategory, TemplateStatus } from '@prisma/client';
import { SEBI_AMFI_MANDATORY_FOOTER } from '../templates.constants';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: PrismaService;
  let metaAdapter: MetaTemplatesAdapter;

  const mockPrismaService = {
    messageTemplate: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    templateVersion: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockMetaAdapter = {
    submitTemplate: jest.fn(),
    getTemplateStatus: jest.fn(),
    syncQualityScore: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MetaTemplatesAdapter, useValue: mockMetaAdapter },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
    prisma = module.get<PrismaService>(PrismaService);
    metaAdapter = module.get<MetaTemplatesAdapter>(MetaTemplatesAdapter);

    jest.clearAllMocks();
  });

  describe('Property P6: Variable Extraction & Validation', () => {
    it('should correctly extract sequential numeric placeholders {{1}}, {{2}}, {{3}}', () => {
      const text = 'Hello {{1}}, your SIP of INR {{2}} has executed on {{3}}.';
      const result = service.validateTemplatePlaceholders(text);

      expect(result.valid).toBe(true);
      expect(result.extractedPlaceholders).toEqual(['1', '2', '3']);
    });

    it('should allow template bodies with single placeholder {{1}} or zero placeholders', () => {
      const single = service.validateTemplatePlaceholders('Happy birthday {{1}} from Wealth Trade!');
      expect(single.valid).toBe(true);
      expect(single.extractedPlaceholders).toEqual(['1']);

      const zero = service.validateTemplatePlaceholders('Markets are closed on Diwali.');
      expect(zero.valid).toBe(true);
      expect(zero.extractedPlaceholders).toEqual([]);
    });

    it('should reject template with sequential gap (e.g. {{1}}, {{3}} missing {{2}})', () => {
      const text = 'Hello {{1}}, your balance is {{3}}.';
      const result = service.validateTemplatePlaceholders(text);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/gap or out of order/i);
    });

    it('should reject alphanumeric named placeholders like {{name}} or {{amount}}', () => {
      const text = 'Hello {{client_name}}, your portfolio value is {{value}}.';
      const result = service.validateTemplatePlaceholders(text);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/alphanumeric names/i);
    });

    it('should reject malformed unclosed placeholder braces', () => {
      const text = 'Hello {{1, please check your account.';
      const result = service.validateTemplatePlaceholders(text);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/malformed unclosed placeholder/i);
    });

    it('should enforce Property P6 variable completeness and throw if definition is missing', () => {
      const text = 'Hello {{1}}, your trade of {{2}} was filled.';
      // Missing sample for variable 2
      expect(() => {
        service.validatePropertyP6(text, { '1': 'Alice' });
      }).toThrow(BadRequestException);

      // Valid case with all variables defined
      const valid = service.validatePropertyP6(text, { '1': 'Alice', '2': '100 shares' });
      expect(valid.valid).toBe(true);
      expect(valid.extractedPlaceholders).toEqual(['1', '2']);
    });
  });

  describe('SEBI/AMFI Mandatory Footer Enforcement', () => {
    it('should accept MARKETING template ending with exact authorized SEBI/AMFI footer', () => {
      const check = service.validateSebiFooter('MARKETING', SEBI_AMFI_MANDATORY_FOOTER);
      expect(check.valid).toBe(true);
    });

    it('should reject MARKETING template completely missing a footer', () => {
      const check = service.validateSebiFooter('MARKETING', '');
      expect(check.valid).toBe(false);
      expect(check.error).toMatch(/SEBI\/AMFI/i);
    });

    it('should reject MARKETING template with modified/tampered footer text', () => {
      const check = service.validateSebiFooter('MARKETING', 'Informational Only - Not Financial Advice');
      expect(check.valid).toBe(false);
      expect(check.error).toMatch(/does not match authorized/i);
    });

    it('should permit UTILITY category template without SEBI/AMFI footer', () => {
      const check = service.validateSebiFooter(TemplateCategory.UTILITY, 'Customer Support Desk');
      expect(check.valid).toBe(true);
    });

    it('should permit AUTHENTICATION category template without SEBI/AMFI footer', () => {
      const check = service.validateSebiFooter(TemplateCategory.AUTHENTICATION, undefined);
      expect(check.valid).toBe(true);
    });
  });

  describe('Live Variable Preview', () => {
    it('should substitute sample values into placeholders', () => {
      const preview = service.preview({
        bodyText: 'Hello {{1}}, your order for {{2}} is confirmed on {{3}}.',
        sampleValues: {
          '1': 'Rahul',
          '2': 'TCS Shares',
          '3': '19-Nov-2026',
        },
      });

      expect(preview.previewText).toBe('Hello Rahul, your order for TCS Shares is confirmed on 19-Nov-2026.');
      expect(preview.extractedVariables).toEqual(['1', '2', '3']);
      expect(preview.missingVariables).toEqual([]);
    });

    it('should track missing variables and retain placeholder syntax when value is not provided', () => {
      const preview = service.preview({
        bodyText: 'Hello {{1}}, your OTP is {{2}}.',
        sampleValues: {
          '1': 'Rahul',
        },
      });

      expect(preview.previewText).toBe('Hello Rahul, your OTP is {{2}}.');
      expect(preview.missingVariables).toEqual(['2']);
    });
  });

  describe('Template Creation & Immutable Versioning', () => {
    it('should create template draft and version 1 with auto-applied SEBI footer for MARKETING', async () => {
      mockPrismaService.messageTemplate.create.mockResolvedValue({
        id: 'tmpl-uuid-1',
        name: 'market_update_diwali',
        category: TemplateCategory.MARKETING,
        status: TemplateStatus.DRAFT,
        versions: [{ versionNumber: 1, bodyText: 'Diwali offer {{1}}' }],
      });

      const result = await service.create({
        name: 'market_update_diwali',
        category: TemplateCategory.MARKETING,
        body_text: 'Diwali offer {{1}}',
        variable_samples: { '1': 'Special Bonus' },
      });

      expect(result.id).toBe('tmpl-uuid-1');
      expect(mockPrismaService.messageTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'market_update_diwali',
            category: TemplateCategory.MARKETING,
            status: TemplateStatus.DRAFT,
            versions: expect.objectContaining({
              create: expect.objectContaining({
                versionNumber: 1,
                footerText: SEBI_AMFI_MANDATORY_FOOTER,
              }),
            }),
          }),
        }),
      );
    });

    it('should increment version number (v1 -> v2) when creating a new version without mutating v1', async () => {
      mockPrismaService.messageTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-uuid-1',
        name: 'sip_alert',
        category: TemplateCategory.UTILITY,
        versions: [{ versionNumber: 1, bodyText: 'SIP {{1}} executed' }],
      });

      mockPrismaService.templateVersion.create.mockResolvedValue({
        id: 'ver-uuid-2',
        templateId: 'tmpl-uuid-1',
        versionNumber: 2,
        bodyText: 'SIP {{1}} executed on {{2}}',
      });

      const newVersion = await service.createVersion('tmpl-uuid-1', {
        body_text: 'SIP {{1}} executed on {{2}}',
        variable_samples: { '1': '10,000', '2': '19-Nov-2026' },
      });

      expect(newVersion.versionNumber).toBe(2);
      expect(mockPrismaService.templateVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            templateId: 'tmpl-uuid-1',
            versionNumber: 2,
          }),
        }),
      );
    });
  });

  describe('Meta Submission & Quality Score Sync', () => {
    it('should submit template to Meta and set status to PENDING_APPROVAL', async () => {
      mockPrismaService.messageTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-uuid-1',
        name: 'test_marketing',
        category: TemplateCategory.MARKETING,
        language: 'hi',
        versions: [{ id: 'ver-1', versionNumber: 1, bodyText: 'Test {{1}}' }],
      });

      mockMetaAdapter.submitTemplate.mockResolvedValue({
        success: true,
        metaTemplateId: 'meta-tmpl-123',
        status: TemplateStatus.PENDING_APPROVAL,
      });

      mockPrismaService.messageTemplate.update.mockResolvedValue({});
      mockPrismaService.templateVersion.update.mockResolvedValue({});

      const res = await service.submitForApproval('tmpl-uuid-1');

      expect(res.status).toBe(TemplateStatus.PENDING_APPROVAL);
      expect(res.metaTemplateId).toBe('meta-tmpl-123');
      expect(mockPrismaService.messageTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tmpl-uuid-1' },
        data: {
          status: TemplateStatus.PENDING_APPROVAL,
          metaTemplateId: 'meta-tmpl-123',
        },
      });
    });

    it('should sync quality rating and detect when RED rating blocks campaign usage', async () => {
      mockPrismaService.messageTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-uuid-1',
        name: 'test_template',
        metaTemplateId: 'meta-tmpl-123',
        qualityRating: QualityRating.UNKNOWN,
        versions: [],
      });

      mockMetaAdapter.syncQualityScore.mockResolvedValue(QualityRating.RED);
      mockPrismaService.messageTemplate.update.mockResolvedValue({});

      const syncResult = await service.syncQuality('tmpl-uuid-1');

      expect(syncResult.qualityRating).toBe(QualityRating.RED);
      expect(syncResult.blockedFromCampaigns).toBe(true);

      mockPrismaService.messageTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-uuid-1',
        status: TemplateStatus.APPROVED,
        qualityRating: QualityRating.RED,
        deletedAt: null,
      });

      const eligibility = await service.isTemplateUsableForCampaign('tmpl-uuid-1');
      expect(eligibility.usable).toBe(false);
      expect(eligibility.reason).toMatch(/RED quality score/i);
    });

    it('should permit APPROVED template with GREEN or YELLOW quality rating for campaigns', async () => {
      mockPrismaService.messageTemplate.findFirst.mockResolvedValue({
        id: 'tmpl-uuid-2',
        status: TemplateStatus.APPROVED,
        qualityRating: QualityRating.GREEN,
        deletedAt: null,
      });

      const eligibility = await service.isTemplateUsableForCampaign('tmpl-uuid-2');
      expect(eligibility.usable).toBe(true);
    });
  });
});
