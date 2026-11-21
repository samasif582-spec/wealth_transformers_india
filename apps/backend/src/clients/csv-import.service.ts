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

/**
 * Flexible Date of Birth Parser supporting:
 * - DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
 * - YYYY-MM-DD, YYYY/MM/DD
 * - Excel numeric date serials (e.g. 25134)
 * - ISO string and standard date fallbacks
 */
export function parseDateOfBirth(input?: string | number | null): Date | undefined {
  if (input === undefined || input === null) return undefined;
  const str = String(input).trim();
  if (!str) return undefined;

  // 1. DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d;
    }
  }

  // 2. YYYY-MM-DD, YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d;
    }
  }

  // 3. Excel serial number (4-5 digits)
  if (/^\d{4,5}$/.test(str)) {
    const serial = parseInt(str, 10);
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + serial * 86400000);
    if (!isNaN(d.getTime())) return d;
  }

  // 4. Standard Date fallback
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d;
  }

  return undefined;
}

/**
 * Extracts a row value case-insensitively and whitespace/symbol-insensitively.
 */
function extractRowValue(row: Record<string, string>, ...candidateKeys: string[]): string {
  // Direct match first
  for (const k of candidateKeys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  // Normalized match (lowercase, no spaces/underscores/hyphens)
  const rowEntries = Object.entries(row);
  for (const candidate of candidateKeys) {
    const target = candidate.toLowerCase().replace(/[\s_\-]/g, '');
    for (const [key, val] of rowEntries) {
      if (key.toLowerCase().replace(/[\s_\-]/g, '') === target) {
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
    }
  }
  return '';
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

    // Check mandatory header fields using normalized keys
    const fields = parsed.meta.fields || [];
    const normalizedFields = fields.map((f) => f.toLowerCase().replace(/[\s_\-]/g, ''));

    const hasNameHeader =
      normalizedFields.includes('fullname') ||
      normalizedFields.includes('name') ||
      normalizedFields.includes('clientname') ||
      normalizedFields.includes('firstname') ||
      normalizedFields.includes('first');

    const hasPhoneHeader =
      normalizedFields.includes('whatsappnumber') ||
      normalizedFields.includes('mobilenumber') ||
      normalizedFields.includes('mobile') ||
      normalizedFields.includes('phonenumber') ||
      normalizedFields.includes('phone') ||
      normalizedFields.includes('contact') ||
      normalizedFields.includes('contactnumber');

    if (!hasNameHeader || !hasPhoneHeader) {
      return {
        success: false,
        imported: 0,
        errors: [
          {
            line: 1,
            field: 'header',
            error:
              'Missing required header columns: full_name (or name / first_name) and whatsapp_number (or mobile_number / phone)',
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

      // 1. Client Name (supports fullName, name, or firstName + lastName)
      let rawName = extractRowValue(
        row,
        'full_name',
        'fullName',
        'name',
        'client_name',
        'clientName',
      );
      if (!rawName) {
        const firstName = extractRowValue(row, 'first_name', 'firstName', 'first');
        const lastName = extractRowValue(row, 'last_name', 'lastName', 'last', 'surname');
        rawName = [firstName, lastName].filter(Boolean).join(' ');
      }

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

      // 2. WhatsApp / Mobile Number (supports international + and standard formats)
      const rawPhone = extractRowValue(
        row,
        'whatsapp_number',
        'whatsappNumber',
        'mobile_number',
        'mobileNumber',
        'phone_number',
        'phoneNumber',
        'whatsapp',
        'mobile',
        'phone',
        'contact',
        'contact_number',
        'contactNumber',
      );

      // Clean internal spaces, hyphens, and parentheses from phone number
      const cleanedPhone = rawPhone.startsWith('+')
        ? '+' + rawPhone.slice(1).replace(/[\s\-\(\)]/g, '')
        : rawPhone.replace(/[\s\-\(\)]/g, '');

      const phoneCheck = normalizeToE164(cleanedPhone, '' as any);
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

      // 3. Category Tier Validation (defaults to RETAIL if omitted)
      const rawTier = (
        extractRowValue(row, 'category_tier', 'categoryTier', 'tier', 'category') || 'RETAIL'
      )
        .toUpperCase()
        .trim();
      const validTiers = ['RETAIL', 'HNI', 'CORPORATE', 'PROSPECT'];
      if (!validTiers.includes(rawTier)) {
        validationErrors.push({
          line,
          field: 'category_tier',
          error: `Invalid tier: ${rawTier}`,
        });
      }

      // 4. Email Validation (optional)
      const rawEmail = extractRowValue(row, 'email', 'email_address', 'emailAddress', 'mail').trim();
      if (rawEmail.length > 0) {
        if (!rawEmail.includes('@') || rawEmail.length > 320) {
          validationErrors.push({
            line,
            field: 'email',
            error: `Malformed email: ${rawEmail}`,
          });
        }
      }

      // 5. Consent Status (defaults to OPTED_IN for onboarding import)
      const rawConsent = (
        extractRowValue(
          row,
          'consent_status',
          'consentStatus',
          'consent',
          'communication_consent',
          'communicationConsent',
        ) || 'OPTED_IN'
      )
        .toUpperCase()
        .trim();
      const consentStatus: ConsentStatus =
        rawConsent === 'PENDING' ? ConsentStatus.PENDING : ConsentStatus.OPTED_IN;

      // 6. Date of Birth (supports DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, Excel serials)
      const rawDob = extractRowValue(
        row,
        'date_of_birth',
        'dateOfBirth',
        'dob',
        'birth_date',
        'birthDate',
        'birthdate',
      );
      const dob = parseDateOfBirth(rawDob);

      // 7. Preferred Language (defaults to 'en')
      const preferredLanguage =
        extractRowValue(
          row,
          'preferred_language',
          'preferredLanguage',
          'language',
          'lang',
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
