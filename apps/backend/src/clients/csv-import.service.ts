import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { normalizeToE164 } from './utils/phone-normalizer';
import { CategoryTier, ConsentStatus, AccountStatus } from '@prisma/client';

export interface ImportError {
  line: number;
  field: string;
  error: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors?: ImportError[];
}

export interface ValidatedClientRow {
  fullName: string;
  whatsappNumber: string;
  email?: string;
  categoryTier: CategoryTier;
  preferredLanguage: string;
  dateOfBirth?: Date;
  consentStatus: ConsentStatus;
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Processes a CSV or XLSX file from an in-memory buffer or a disk file path.
   */
  async processImport(
    input: { buffer?: Buffer; filePath?: string; filename?: string },
    actorUserId?: string,
  ): Promise<ImportResult> {
    const filename = input.filename || 'import.csv';
    const isXlsx =
      filename.endsWith('.xlsx') ||
      filename.endsWith('.xls') ||
      (input.filename && /\.(xlsx|xls)$/i.test(input.filename));

    let csvText: string;

    try {
      if (isXlsx) {
        let workbook: XLSX.WorkBook;
        if (input.buffer) {
          workbook = XLSX.read(input.buffer, { type: 'buffer', dense: true });
        } else if (input.filePath) {
          workbook = XLSX.readFile(input.filePath, { dense: true });
        } else {
          throw new BadRequestException('No import data provided');
        }

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
          throw new BadRequestException('Workbook contains no readable sheets');
        }
        csvText = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
      } else {
        if (input.buffer) {
          csvText = input.buffer.toString('utf-8');
        } else if (input.filePath) {
          csvText = await fs.promises.readFile(input.filePath, 'utf-8');
        } else {
          throw new BadRequestException('No import data provided');
        }
      }
    } finally {
      // If a temporary filePath was provided, clean it up
      if (input.filePath) {
        fs.unlink(input.filePath, () => {});
      }
    }

    return this.parseAndPersist(csvText, filename, actorUserId);
  }

  /**
   * Two-pass parser:
   * Pass 1: Line-by-line validation with atomic error reporting and duplicate detection.
   * Pass 2: Transactional batch persistence if and only if zero validation errors occurred.
   */
  async parseAndPersist(
    csvText: string,
    filename: string,
    actorUserId?: string,
  ): Promise<ImportResult> {
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    // Check mandatory header fields
    const fields = parsed.meta.fields || [];
    const hasNameHeader = fields.includes('full_name') || fields.includes('name');
    const hasPhoneHeader = fields.includes('whatsapp_number') || fields.includes('phone');

    if (!hasNameHeader || !hasPhoneHeader) {
      return {
        success: false,
        imported: 0,
        errors: [
          {
            line: 1,
            field: 'header',
            error: 'Missing required header columns: full_name (or name) and whatsapp_number (or phone)',
          },
        ],
      };
    }

    // ─── PASS 1: Line-by-line Validation ──────────────────────────────────────
    const validationErrors: ImportError[] = [];
    const validatedRows: ValidatedClientRow[] = [];
    const phoneSet = new Set<string>();

    parsed.data.forEach((row, index) => {
      const line = index + 2; // Line 1 is header row

      // 1. Mandatory Client Name (2-150 chars)
      const rawName = (row['full_name'] ?? row['name'] ?? '').trim();
      if (!rawName || rawName.length === 0) {
        validationErrors.push({
          line,
          field: 'full_name',
          error: 'Missing client name',
        });
      } else if (rawName.length < 2 || rawName.length > 150) {
        validationErrors.push({
          line,
          field: 'full_name',
          error: 'Client name must be between 2 and 150 characters',
        });
      }

      // 2. Mandatory WhatsApp Number (E.164 normalization, without auto-default to require + if international)
      const rawPhone = (row['whatsapp_number'] ?? row['phone'] ?? '').trim();
      const phoneCheck = normalizeToE164(rawPhone, '' as any);
      if (!phoneCheck.valid) {
        validationErrors.push({
          line,
          field: 'whatsapp_number',
          error: phoneCheck.error || 'Invalid phone number format',
        });
      } else {
        const normalizedPhone = phoneCheck.e164!;
        // Intra-file duplicate phone check
        if (phoneSet.has(normalizedPhone)) {
          validationErrors.push({
            line,
            field: 'whatsapp_number',
            error: `Duplicate phone number in import file: ${normalizedPhone}`,
          });
        } else {
          phoneSet.add(normalizedPhone);
        }
      }

      // 3. Category Tier Validation
      const rawTier = (row['category_tier'] ?? row['category'] ?? 'RETAIL')
        .toUpperCase()
        .trim();
      const validTiers = ['RETAIL', 'HNI', 'CORPORATE', 'PROSPECT'];
      if (!validTiers.includes(rawTier)) {
        validationErrors.push({
          line,
          field: 'category_tier',
          error: `Invalid tier: ${row['category_tier'] ?? row['category']}`,
        });
      }

      // 4. Email Validation
      const rawEmail = (row['email'] ?? '').trim();
      if (rawEmail.length > 0) {
        if (!rawEmail.includes('@') || rawEmail.length > 320) {
          validationErrors.push({
            line,
            field: 'email',
            error: `Malformed email: ${rawEmail}`,
          });
        }
      }

      // 5. Consent Status
      const rawConsent = (
        row['consent_status'] ??
        row['consent'] ??
        row['communication_consent'] ??
        ''
      )
        .toUpperCase()
        .trim();
      const consentStatus: ConsentStatus =
        rawConsent === 'OPTED_IN' ? ConsentStatus.OPTED_IN : ConsentStatus.PENDING;

      // 6. Dates
      const rawDob = (row['date_of_birth'] ?? row['dob'] ?? '').trim();
      let dob: Date | undefined;
      if (rawDob) {
        const d = new Date(rawDob);
        if (!isNaN(d.getTime())) dob = d;
      }

      const preferredLanguage = (
        row['preferred_language'] ??
        row['language'] ??
        'en'
      ).trim().slice(0, 5) || 'en';

      if (phoneCheck.valid && rawName && validTiers.includes(rawTier)) {
        validatedRows.push({
          fullName: rawName,
          whatsappNumber: phoneCheck.e164!,
          email: rawEmail || undefined,
          categoryTier: rawTier as CategoryTier,
          preferredLanguage,
          dateOfBirth: dob,
          consentStatus,
        });
      }
    });

    // ─── ATOMIC ERROR REPORTING ───────────────────────────────────────────────
    if (validationErrors.length > 0) {
      return {
        success: false,
        imported: 0,
        errors: validationErrors,
      };
    }

    // ─── PASS 2: Transactional Batch Persistence ──────────────────────────────
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const item of validatedRows) {
          const client = await tx.client.upsert({
            where: { whatsappNumber: item.whatsappNumber },
            create: {
              fullName: item.fullName,
              whatsappNumber: item.whatsappNumber,
              email: item.email,
              categoryTier: item.categoryTier,
              preferredLanguage: item.preferredLanguage,
              dateOfBirth: item.dateOfBirth,
              communicationConsent: item.consentStatus,
              accountStatus: AccountStatus.ACTIVE,
            },
            update: {
              fullName: item.fullName,
              email: item.email,
              categoryTier: item.categoryTier,
              preferredLanguage: item.preferredLanguage,
              dateOfBirth: item.dateOfBirth,
            },
          });

          // Insert immutable consent record for import
          await tx.whatsappConsent.create({
            data: {
              clientId: client.id,
              consentStatus: item.consentStatus,
              consentSource: 'IMPORT',
              reason: `Bulk import from file: ${filename}`,
              recordedByUserId: actorUserId,
            },
          });
        }
      });

      // Audit log after successful import
      await this.auditService.log({
        actorId: actorUserId,
        actionType: 'CREATE',
        resourceType: 'client_import',
        metadata: {
          filename,
          importedCount: validatedRows.length,
          timestamp: new Date().toISOString(),
        },
      });

      return {
        success: true,
        imported: validatedRows.length,
      };
    } catch (err: any) {
      this.logger.error(`Import persistence failed for ${filename}: ${err.message}`, err.stack);
      throw err;
    }
  }
}
