import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QualityRating, TemplateCategory, TemplateStatus } from '@prisma/client';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { FilterTemplateDto } from './dto/filter-template.dto';
import { TemplatePreviewDto } from './dto/template-preview.dto';
import { MetaTemplatesAdapter } from './meta-templates.adapter';
import { SEBI_AMFI_MANDATORY_FOOTER } from './templates.constants';

// ─── Placeholder & Property P6 Validation ───────────────────────────────────

/**
 * Validates sequential {{N}} numeric placeholder variables according to Meta specifications.
 * Property P6: strictly contiguous numbers starting from {{1}} without gaps or alphanumeric names.
 */
export function validateTemplatePlaceholders(bodyText: string): {
  valid: boolean;
  extractedPlaceholders: string[];
  error?: string;
} {
  // Reject unclosed or malformed braces like {{1 without closing }} or dangling }}
  if (/\{\{[^}]*$/.test(bodyText) || /^[^{]*\}\}/.test(bodyText)) {
    return {
      valid: false,
      extractedPlaceholders: [],
      error: 'Malformed unclosed placeholder syntax',
    };
  }

  // Check for invalid named placeholders like {{name}} or {{amount}}
  const namedMatch = bodyText.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g);
  if (namedMatch && namedMatch.length > 0) {
    return {
      valid: false,
      extractedPlaceholders: [],
      error: 'Placeholders must be sequential numeric numbers (e.g. {{1}}), not alphanumeric names',
    };
  }

  // Extract all {{N}} numeric placeholders
  const regex = /\{\{(\d+)\}\}/g;
  const matches = [...bodyText.matchAll(regex)].map((m) => m[1]);

  if (matches.length === 0) {
    return { valid: true, extractedPlaceholders: [] };
  }

  // Check sequential continuity starting from 1
  for (let i = 0; i < matches.length; i++) {
    const expected = (i + 1).toString();
    if (matches[i] !== expected) {
      return {
        valid: false,
        extractedPlaceholders: matches,
        error: `Numbering sequence has a gap or out of order: expected {{${expected}}} but found {{${matches[i]}}}`,
      };
    }
  }

  return { valid: true, extractedPlaceholders: matches };
}

/**
 * Validates SEBI/AMFI footer requirement on MARKETING templates.
 */
export function validateSebiFooter(
  category: TemplateCategory | string,
  footerText?: string,
): { valid: boolean; error?: string } {
  if (category === TemplateCategory.MARKETING || category === 'MARKETING') {
    if (!footerText || footerText.trim() === '') {
      return {
        valid: false,
        error: 'MARKETING category templates strictly require mandatory SEBI/AMFI registration footer',
      };
    }
    if (
      footerText.trim() !== SEBI_AMFI_MANDATORY_FOOTER &&
      !footerText.includes('SEBI Reg: INZ000123456')
    ) {
      return {
        valid: false,
        error: 'Footer does not match authorized SEBI/AMFI registration format',
      };
    }
  }
  return { valid: true };
}

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metaAdapter: MetaTemplatesAdapter,
  ) {}

  validateTemplatePlaceholders(bodyText: string): {
    valid: boolean;
    extractedPlaceholders: string[];
    error?: string;
  } {
    return validateTemplatePlaceholders(bodyText);
  }

  validateSebiFooter(
    category: TemplateCategory | string,
    footerText?: string,
  ): { valid: boolean; error?: string } {
    return validateSebiFooter(category, footerText);
  }

  /**
   * Enforces Property P6: Variable Completeness.
   * Every placeholder in the template must have a corresponding non-empty definition/sample.
   */
  validatePropertyP6(
    bodyText: string,
    variableSamplesOrSchema?: Record<string, any>,
  ): { valid: boolean; extractedPlaceholders: string[] } {
    const placeholderResult = this.validateTemplatePlaceholders(bodyText);
    if (!placeholderResult.valid) {
      throw new BadRequestException(placeholderResult.error);
    }

    const { extractedPlaceholders } = placeholderResult;
    if (extractedPlaceholders.length > 0) {
      if (!variableSamplesOrSchema || Object.keys(variableSamplesOrSchema).length === 0) {
        throw new BadRequestException(
          `Missing variable definitions/samples for template placeholder(s): ${extractedPlaceholders.map((v: string) => `{{${v}}}`).join(', ')}`,
        );
      }

      const missing: string[] = [];
      for (const placeholder of extractedPlaceholders) {
        const val =
          variableSamplesOrSchema[placeholder] ??
          variableSamplesOrSchema[Number(placeholder)] ??
          variableSamplesOrSchema[`{{${placeholder}}}`];

        if (val === undefined || val === null || val === '') {
          missing.push(`{{${placeholder}}}`);
        }
      }

      if (missing.length > 0) {
        throw new BadRequestException(
          `Missing variable definitions/samples for template placeholder(s): ${missing.join(', ')}`,
        );
      }
    }

    return { valid: true, extractedPlaceholders };
  }

  // ─── Live Variable Preview ──────────────────────────────────────────────────

  /**
   * Live sample variable substitution preview.
   * Substitutes sample values into template body placeholders and tracks missing variables.
   */
  preview(dto: TemplatePreviewDto): {
    previewText: string;
    extractedVariables: string[];
    missingVariables: string[];
    headerText?: string;
    footerText?: string;
  } {
    const placeholderResult = this.validateTemplatePlaceholders(dto.bodyText);
    const extractedVariables = placeholderResult.extractedPlaceholders;
    const missingVariables: string[] = [];
    const sampleValues = dto.sampleValues || {};

    let previewText = dto.bodyText;

    for (const v of extractedVariables) {
      const sampleVal =
        sampleValues[v] ??
        sampleValues[Number(v)] ??
        sampleValues[`{{${v}}}`];

      if (sampleVal !== undefined && sampleVal !== null) {
        previewText = previewText.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), sampleVal);
      } else {
        missingVariables.push(v);
      }
    }

    return {
      previewText,
      extractedVariables,
      missingVariables,
      headerText: dto.headerText,
      footerText: dto.footerText,
    };
  }

  // ─── CRUD & Lifecycle ────────────────────────────────────────────────────────

  /**
   * Creates a new template in DRAFT status with immutable version 1.
   * Enforces Property P6 validation and SEBI/AMFI footer on MARKETING templates.
   */
  async create(
    dto: CreateTemplateDto,
    userId = '00000000-0000-0000-0000-000000000000',
  ) {
    // 1. Validate Property P6
    const schema = dto.variable_schema || dto.variable_samples;
    this.validatePropertyP6(dto.body_text, schema);

    // 2. Validate / Enforce SEBI Footer for MARKETING templates
    let footerText = dto.footer_text;
    if (dto.category === TemplateCategory.MARKETING) {
      if (!footerText || footerText.trim() === '') {
        footerText = SEBI_AMFI_MANDATORY_FOOTER;
      } else {
        const footerCheck = this.validateSebiFooter(dto.category, footerText);
        if (!footerCheck.valid) {
          throw new BadRequestException(footerCheck.error);
        }
      }
    }

    // 3. Persist MessageTemplate and Version 1
    const template = await this.prisma.messageTemplate.create({
      data: {
        name: dto.name,
        category: dto.category,
        language: dto.language ?? 'hi',
        status: TemplateStatus.DRAFT,
        createdByUserId: userId,
        versions: {
          create: {
            versionNumber: 1,
            status: TemplateStatus.DRAFT,
            bodyText: dto.body_text,
            headerType: dto.header_type ?? null,
            headerText: dto.header_text ?? null,
            headerMediaId: dto.header_media_id ?? null,
            footerText: footerText ?? null,
            variableSchema: (schema as any) ?? {},
            buttons: (dto.buttons as any) ?? undefined,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    this.logger.log(`Created template ${template.name} (ID: ${template.id}) in DRAFT status`);
    return template;
  }

  /**
   * Creates a new immutable version for an existing template.
   */
  async createVersion(templateId: string, dto: CreateTemplateVersionDto) {
    const template = await this.findOne(templateId);

    // 1. Validate Property P6
    const schema = dto.variable_schema || dto.variable_samples;
    this.validatePropertyP6(dto.body_text, schema);

    // 2. Validate SEBI Footer for MARKETING
    let footerText = dto.footer_text;
    if (template.category === TemplateCategory.MARKETING) {
      if (!footerText || footerText.trim() === '') {
        footerText = SEBI_AMFI_MANDATORY_FOOTER;
      } else {
        const footerCheck = this.validateSebiFooter(template.category, footerText);
        if (!footerCheck.valid) {
          throw new BadRequestException(footerCheck.error);
        }
      }
    }

    // Determine next version number
    const latestVersion = template.versions[0];
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    // Create immutable new version
    const version = await this.prisma.templateVersion.create({
      data: {
        templateId,
        versionNumber: nextVersionNumber,
        status: TemplateStatus.DRAFT,
        bodyText: dto.body_text,
        headerType: dto.header_type ?? latestVersion?.headerType ?? null,
        headerText: dto.header_text ?? latestVersion?.headerText ?? null,
        headerMediaId: dto.header_media_id ?? latestVersion?.headerMediaId ?? null,
        footerText: footerText ?? latestVersion?.footerText ?? null,
        variableSchema: (schema as any) ?? (latestVersion?.variableSchema as any) ?? {},
        buttons: (dto.buttons as any) ?? (latestVersion?.buttons as any) ?? undefined,
      },
    });

    // Update template status to DRAFT
    await this.prisma.messageTemplate.update({
      where: { id: templateId },
      data: { status: TemplateStatus.DRAFT },
    });

    this.logger.log(
      `Created version ${nextVersionNumber} for template ${template.name} (ID: ${templateId})`,
    );

    return version;
  }

  /**
   * Submits a template to Meta Graph API v20.0 for review.
   * Transitions status from DRAFT to PENDING_APPROVAL.
   */
  async submitForApproval(id: string): Promise<{
    status: TemplateStatus;
    metaTemplateId: string;
  }> {
    const template = await this.findOne(id);
    const latestVersion = template.versions[0];

    if (!latestVersion) {
      throw new BadRequestException(`Template ${id} has no version to submit`);
    }

    // Format components for Meta Graph API v20.0
    const components: unknown[] = [];

    if (latestVersion.headerType && latestVersion.headerText) {
      components.push({
        type: 'HEADER',
        format: latestVersion.headerType,
        text: latestVersion.headerText,
      });
    }

    components.push({
      type: 'BODY',
      text: latestVersion.bodyText,
    });

    if (latestVersion.footerText) {
      components.push({
        type: 'FOOTER',
        text: latestVersion.footerText,
      });
    }

    if (latestVersion.buttons && Array.isArray(latestVersion.buttons) && latestVersion.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: latestVersion.buttons,
      });
    }

    // Call Meta adapter
    const metaResult = await this.metaAdapter.submitTemplate({
      name: template.name,
      language: template.language,
      category: template.category,
      components,
    });

    const now = new Date();

    // Update template status and metaTemplateId
    await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        status: TemplateStatus.PENDING_APPROVAL,
        metaTemplateId: metaResult.metaTemplateId,
      },
    });

    // Update latest version submission timestamp and status
    await this.prisma.templateVersion.update({
      where: { id: latestVersion.id },
      data: {
        status: TemplateStatus.PENDING_APPROVAL,
        submittedAt: now,
      },
    });

    this.logger.log(
      `Submitted template ${template.name} to Meta. Assigned Meta ID: ${metaResult.metaTemplateId}`,
    );

    return {
      status: TemplateStatus.PENDING_APPROVAL,
      metaTemplateId: metaResult.metaTemplateId,
    };
  }

  /**
   * Syncs template approval status from Meta Graph API v20.0
   */
  async syncStatus(id: string): Promise<{ status: TemplateStatus }> {
    const template = await this.findOne(id);

    if (!template.metaTemplateId) {
      this.logger.warn(`Template ${id} has no metaTemplateId to sync`);
      return { status: template.status };
    }

    const metaStatus = await this.metaAdapter.getTemplateStatus(template.metaTemplateId);
    const latestVersion = template.versions[0];
    const now = new Date();

    const updateData: any = { status: metaStatus.status };
    const versionUpdateData: any = { status: metaStatus.status };

    if (metaStatus.status === TemplateStatus.APPROVED) {
      versionUpdateData.approvedAt = now;
    } else if (metaStatus.status === TemplateStatus.REJECTED) {
      versionUpdateData.rejectedAt = now;
      versionUpdateData.rejectionReason = metaStatus.rejectionReason || 'Rejected by Meta';
    }

    await this.prisma.messageTemplate.update({
      where: { id },
      data: updateData,
    });

    if (latestVersion) {
      await this.prisma.templateVersion.update({
        where: { id: latestVersion.id },
        data: versionUpdateData,
      });
    }

    this.logger.log(`Synced status for template ${template.name}: ${metaStatus.status}`);
    return { status: metaStatus.status };
  }

  /**
   * Syncs Meta quality rating (GREEN, YELLOW, RED).
   * RED quality rating automatically blocks new campaign usage.
   */
  async syncQuality(id: string): Promise<{
    templateId: string;
    qualityRating: QualityRating;
    blockedFromCampaigns: boolean;
  }> {
    const template = await this.findOne(id);

    if (!template.metaTemplateId) {
      return {
        templateId: id,
        qualityRating: template.qualityRating,
        blockedFromCampaigns: template.qualityRating === QualityRating.RED,
      };
    }

    const qualityRating = await this.metaAdapter.syncQualityScore(template.metaTemplateId);
    const now = new Date();

    await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        qualityRating,
        qualityCheckedAt: now,
      },
    });

    const blockedFromCampaigns = qualityRating === QualityRating.RED;
    this.logger.log(
      `Synced quality rating for template ${template.name}: ${qualityRating} (Blocked: ${blockedFromCampaigns})`,
    );

    return {
      templateId: id,
      qualityRating,
      blockedFromCampaigns,
    };
  }

  /**
   * Verifies if a template is eligible for campaign dispatch.
   * Templates with RED quality score or non-APPROVED status are blocked.
   */
  async isTemplateUsableForCampaign(id: string): Promise<{
    usable: boolean;
    reason?: string;
  }> {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, deletedAt: null },
    });

    if (!template) {
      return { usable: false, reason: 'Template not found' };
    }

    if (template.status !== TemplateStatus.APPROVED) {
      return {
        usable: false,
        reason: `Template is not approved (current status: ${template.status})`,
      };
    }

    if (template.qualityRating === QualityRating.RED) {
      return {
        usable: false,
        reason: 'Template has RED quality score and is blocked from campaign dispatch',
      };
    }

    return { usable: true };
  }

  /**
   * Retrieves all templates with pagination and filters.
   */
  async findAll(filters: FilterTemplateDto): Promise<{
    data: unknown[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, parseInt(filters.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? '20', 10)));
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.language ? { language: filters.language } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      }),
      this.prisma.messageTemplate.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Retrieves single template with all version records.
   */
  async findOne(id: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });

    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return template;
  }

  /**
   * Soft-deletes a template.
   */
  async archive(id: string): Promise<{ archived: boolean }> {
    await this.findOne(id);
    await this.prisma.messageTemplate.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { archived: true };
  }
}
