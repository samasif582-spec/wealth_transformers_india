import { TemplatesController } from '../templates.controller';
import { TemplatesService } from '../templates.service';
import { QualityRating, TemplateCategory, TemplateStatus } from '@prisma/client';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let mockTemplatesService: any;

  beforeEach(() => {
    mockTemplatesService = {
      create: jest.fn(),
      preview: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      createVersion: jest.fn(),
      submitForApproval: jest.fn(),
      syncQuality: jest.fn(),
      archive: jest.fn(),
    };

    controller = new TemplatesController(mockTemplatesService as TemplatesService);
  });

  it('should create template draft', async () => {
    const dto = {
      name: 'market_briefing',
      category: TemplateCategory.MARKETING,
      body_text: 'Hello {{1}}',
      variable_samples: { '1': 'Customer' },
    };

    mockTemplatesService.create.mockResolvedValue({ id: 'tmpl-1', ...dto });

    const result = await controller.create(dto as any, 'user-123');
    expect(result).toEqual({ id: 'tmpl-1', ...dto });
    expect(mockTemplatesService.create).toHaveBeenCalledWith(dto, 'user-123');
  });

  it('should preview variable substitution', async () => {
    const previewDto = {
      bodyText: 'Hello {{1}}, market is up.',
      sampleValues: { '1': 'Investor' },
    };

    mockTemplatesService.preview.mockReturnValue({
      previewText: 'Hello Investor, market is up.',
      extractedVariables: ['1'],
      missingVariables: [],
    });

    const res = controller.preview(previewDto);
    expect(res.previewText).toBe('Hello Investor, market is up.');
    expect(mockTemplatesService.preview).toHaveBeenCalledWith(previewDto);
  });

  it('should find all templates with filters', async () => {
    mockTemplatesService.findAll.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const res = await controller.findAll({ page: '1', limit: '20' });
    expect(res.total).toBe(0);
    expect(mockTemplatesService.findAll).toHaveBeenCalledWith({ page: '1', limit: '20' });
  });

  it('should submit template for Meta approval', async () => {
    mockTemplatesService.submitForApproval.mockResolvedValue({
      status: TemplateStatus.PENDING_APPROVAL,
      metaTemplateId: 'meta-123',
    });

    const res = await controller.submitForApproval('tmpl-1');
    expect(res.metaTemplateId).toBe('meta-123');
    expect(mockTemplatesService.submitForApproval).toHaveBeenCalledWith('tmpl-1');
  });

  it('should sync template quality rating', async () => {
    mockTemplatesService.syncQuality.mockResolvedValue({
      templateId: 'tmpl-1',
      qualityRating: QualityRating.GREEN,
      blockedFromCampaigns: false,
    });

    const res = await controller.syncQuality('tmpl-1');
    expect(res.qualityRating).toBe(QualityRating.GREEN);
    expect(res.blockedFromCampaigns).toBe(false);
  });

  it('should soft delete template', async () => {
    mockTemplatesService.archive.mockResolvedValue({ archived: true });

    const res = await controller.archive('tmpl-1');
    expect(res.archived).toBe(true);
    expect(mockTemplatesService.archive).toHaveBeenCalledWith('tmpl-1');
  });
});
