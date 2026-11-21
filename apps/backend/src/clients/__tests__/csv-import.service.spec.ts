import { CsvImportService } from '../csv-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CategoryTier, ConsentStatus } from '@prisma/client';

describe('CsvImportService', () => {
  let service: CsvImportService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(async (cb) => {
        const tx = {
          client: {
            upsert: jest.fn().mockResolvedValue({ id: 'mock-client-uuid-1' }),
          },
          whatsappConsent: {
            create: jest.fn().mockResolvedValue({ id: 'mock-consent-uuid-1' }),
          },
        };
        return cb(tx);
      }),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    service = new CsvImportService(mockPrisma as PrismaService, mockAudit as AuditService);
  });

  it('should parse valid CSV and batch-insert clients with consent entries', async () => {
    const validCsv = `full_name,whatsapp_number,category_tier,email,preferred_language,consent_status
Rajesh Kumar,+919999900011,HNI,rajesh@example.com,en,OPTED_IN
Priya Patel,+919999900012,RETAIL,priya@example.com,gu,PENDING`;

    const result = await service.parseAndPersist(validCsv, 'valid.csv', 'admin-user-id');

    expect(result.success).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.errors).toBeUndefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'CREATE',
        resourceType: 'client_import',
      }),
    );
  });

  it('should validate line-by-line and return atomic error report with line numbers starting at 2', async () => {
    const invalidCsv = `full_name,whatsapp_number,category_tier,email
A,+919999900011,HNI,test@example.com
Valid Name,9876543210,SUPER_VIP,malformed_email
Another Client,+919999900012,RETAIL,ok@example.com`;

    const result = await service.parseAndPersist(invalidCsv, 'invalid.csv', 'admin-user-id');

    expect(result.success).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThanOrEqual(3);

    // Line 2: name too short (1 char)
    expect(result.errors!.some((e) => e.line === 2 && e.field === 'full_name')).toBe(true);
    // Line 3: phone missing +, invalid tier SUPER_VIP, malformed email
    expect(result.errors!.some((e) => e.line === 3 && e.field === 'whatsapp_number')).toBe(true);
    expect(result.errors!.some((e) => e.line === 3 && e.field === 'category_tier')).toBe(true);
    expect(result.errors!.some((e) => e.line === 3 && e.field === 'email')).toBe(true);

    // Transaction must NEVER be executed when validation errors occur
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should detect intra-file duplicate phone numbers and report line-numbered error', async () => {
    const duplicateCsv = `full_name,whatsapp_number,category_tier,email
First Client,+919999900011,HNI,first@example.com
Second Client,+919999900011,RETAIL,second@example.com`;

    const result = await service.parseAndPersist(duplicateCsv, 'duplicates.csv');

    expect(result.success).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors).toBeDefined();
    const dupError = result.errors!.find(
      (e) => e.line === 3 && e.field === 'whatsapp_number' && e.error.includes('Duplicate phone number'),
    );
    expect(dupError).toBeDefined();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject file missing required header columns', async () => {
    const badHeaderCsv = `foo,bar,baz\n1,2,3`;
    const result = await service.parseAndPersist(badHeaderCsv, 'bad_headers.csv');

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0].field).toBe('header');
  });

  it('should successfully import streamlined template with mobileNumber, fullName, dateOfBirth (DD-MM-YYYY)', async () => {
    const streamlinedCsv = `mobileNumber,fullName,dateOfBirth
+919811122233,Sunil Mittal,23-10-1968
+919848011223,Kavita Reddy,14-06-1984
+919825099887,Deepak Mehta,30-01-1992`;

    const result = await service.parseAndPersist(streamlinedCsv, 'streamlined.csv', 'admin-id');

    expect(result.success).toBe(true);
    expect(result.imported).toBe(3);
    expect(result.errors).toBeUndefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('should successfully import split firstName and lastName with dateOfBirth', async () => {
    const splitNameCsv = `mobileNumber,firstName,lastName,dateOfBirth
+919820123456,Vikramaditya,Singhania,12-04-1985
+919819876543,Ananya,Deshmukh,1992-08-20`;

    const result = await service.parseAndPersist(splitNameCsv, 'split_names.csv', 'admin-id');

    expect(result.success).toBe(true);
    expect(result.imported).toBe(2);
    expect(result.errors).toBeUndefined();
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
