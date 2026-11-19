import { ClientsService } from '../clients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { CsvImportService } from '../csv-import.service';
import { ConfigService } from '@nestjs/config';
import { CategoryTier, ConsentStatus, AccountStatus } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('ClientsService', () => {
  let service: ClientsService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockAudit: any;
  let mockCsvImport: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'client-uuid-1',
            fullName: 'Rahul Sharma',
            whatsappNumber: '+919999911001',
            email: 'rahul@example.com',
            categoryTier: CategoryTier.HNI,
            communicationConsent: ConsentStatus.OPTED_IN,
            accountStatus: AccountStatus.ACTIVE,
            deletedAt: null,
            tags: [],
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      clientTag: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      messageLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      whatsappConsent: {
        create: jest.fn().mockResolvedValue({ id: 'consent-uuid-1' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-uuid-1' }),
      },
      $transaction: jest.fn(async (cb) => {
        return cb(mockPrisma);
      }),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockCsvImport = {
      processImport: jest.fn().mockResolvedValue({ success: true, imported: 5 }),
    };

    mockConfig = {
      get: jest.fn((key: string, defaultVal?: any) => defaultVal ?? 'localhost'),
    };

    service = new ClientsService(
      mockPrisma as PrismaService,
      mockRedis as RedisService,
      mockAudit as AuditService,
      mockCsvImport as CsvImportService,
      mockConfig as ConfigService,
    );
  });

  describe('findAll (GIN Search & Filtering)', () => {
    it('should query clients excluding soft-deleted clients by default (Property P5)', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should apply substring search across fullName, whatsappNumber, and email', async () => {
      await service.findAll({ q: 'Sharma', page: 1, limit: 25 });

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            OR: [
              { fullName: { contains: 'Sharma', mode: 'insensitive' } },
              { whatsappNumber: { contains: 'Sharma' } },
              { email: { contains: 'Sharma', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should filter by categoryTier, communicationConsent, and accountStatus', async () => {
      await service.findAll({
        categoryTier: CategoryTier.HNI,
        communicationConsent: ConsentStatus.OPTED_IN,
        accountStatus: AccountStatus.ACTIVE,
      });

      expect(mockPrisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            categoryTier: CategoryTier.HNI,
            communicationConsent: ConsentStatus.OPTED_IN,
            accountStatus: AccountStatus.ACTIVE,
          }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should normalize Indian phone numbers to E.164 and create client and consent record', async () => {
      mockPrisma.client.findFirst.mockResolvedValue(null);
      mockPrisma.client.create.mockResolvedValue({
        id: 'new-client-id',
        fullName: 'New Client',
        whatsappNumber: '+919876543210',
        communicationConsent: ConsentStatus.PENDING,
      });

      const client = await service.create(
        {
          fullName: 'New Client',
          whatsappNumber: '9876543210',
        },
        'operator-id',
      );

      expect(client.id).toBe('new-client-id');
      expect(mockPrisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            whatsappNumber: '+919876543210',
          }),
        }),
      );
      expect(mockPrisma.whatsappConsent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'new-client-id',
            consentSource: 'MANUAL_ENTRY',
          }),
        }),
      );
    });

    it('should reject invalid phone numbers', async () => {
      await expect(
        service.create({ fullName: 'Bad Phone', whatsappNumber: 'invalid_123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate phone registration with ConflictException', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.create({ fullName: 'Duplicate', whatsappNumber: '+919876543210' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete and restore', () => {
    it('should soft-delete client by setting deletedAt and accountStatus to INACTIVE', async () => {
      mockPrisma.client.findFirst.mockResolvedValue({
        id: 'client-1',
        fullName: 'To Delete',
        deletedAt: null,
      });
      mockPrisma.client.update.mockResolvedValue({
        id: 'client-1',
        deletedAt: new Date(),
        accountStatus: AccountStatus.INACTIVE,
      });

      const deleted = await service.softDelete('client-1', 'admin-id');

      expect(deleted.accountStatus).toBe(AccountStatus.INACTIVE);
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-1' },
          data: expect.objectContaining({
            accountStatus: AccountStatus.INACTIVE,
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'DELETE' }),
      );
    });

    it('should restore client by clearing deletedAt and setting accountStatus to INACTIVE', async () => {
      mockPrisma.client.findUnique.mockResolvedValue({
        id: 'client-1',
        deletedAt: new Date(),
      });
      mockPrisma.client.update.mockResolvedValue({
        id: 'client-1',
        deletedAt: null,
        accountStatus: AccountStatus.INACTIVE,
      });

      const restored = await service.restore('client-1', 'super-admin-id');

      expect(restored.deletedAt).toBeNull();
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-1' },
          data: {
            deletedAt: null,
            accountStatus: AccountStatus.INACTIVE,
          },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'RESTORE' }),
      );
    });
  });

  describe('eraseClient (DPDP Right-to-Erasure)', () => {
    it('should transactionally anonymize client PII, redact message_logs, and set Redis suppression', async () => {
      const clientId = '12345678-1234-1234-1234-123456789abc';
      mockPrisma.client.findUnique.mockResolvedValue({
        id: clientId,
        fullName: 'Target Client',
        whatsappNumber: '+919999900000',
        email: 'target@example.com',
      });

      const result = await service.eraseClient(
        clientId,
        { confirmed: true, reason: 'Right-to-erasure requested by data subject' },
        'admin-id',
      );

      expect(result.success).toBe(true);
      expect(result.clientId).toBe(clientId);

      // Verify client anonymization
      const expectedPhone = `+ERASED_${clientId.replace(/-/g, '').slice(0, 10)}`;
      expect(expectedPhone.length).toBeLessThanOrEqual(20);

      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: clientId },
          data: expect.objectContaining({
            fullName: `ERASED_${clientId}`,
            email: `ERASED_${clientId}@deleted.local`,
            whatsappNumber: expectedPhone,
            accountStatus: AccountStatus.INACTIVE,
            communicationConsent: ConsentStatus.OPTED_OUT,
          }),
        }),
      );

      // Verify tags deletion and message log redaction
      expect(mockPrisma.clientTag.deleteMany).toHaveBeenCalledWith({ where: { clientId } });
      expect(mockPrisma.messageLog.updateMany).toHaveBeenCalledWith({
        where: { clientId },
        data: { variableValues: { '1': `ERASED_${clientId}` } },
      });

      // Verify Redis suppression key set
      expect(mockRedis.set).toHaveBeenCalledWith(
        `consent:suppressed:${clientId}`,
        'OPTED_OUT',
        'EX',
        86400 * 365,
      );
    });

    it('should throw NotFoundException if client does not exist', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.eraseClient('non-existent', { confirmed: true, reason: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
