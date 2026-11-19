import { ConsentService } from '../consent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { ConsentStatus, ConsentSource } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ConsentService', () => {
  let service: ConsentService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockAudit: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue({ id: 'client-1', communicationConsent: ConsentStatus.PENDING }),
        findFirst: jest.fn().mockResolvedValue({ id: 'client-1', communicationConsent: ConsentStatus.PENDING }),
        update: jest.fn().mockResolvedValue({ id: 'client-1' }),
      },
      whatsappConsent: {
        create: jest.fn().mockResolvedValue({
          id: 'consent-record-1',
          clientId: 'client-1',
          consentStatus: ConsentStatus.OPTED_IN,
          consentSource: ConsentSource.MANUAL_ENTRY,
          recordedAt: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      campaignRecipient: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
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

    mockConfig = {
      get: jest.fn((key: string, defaultVal?: any) => defaultVal ?? 'localhost'),
    };

    service = new ConsentService(
      mockPrisma as PrismaService,
      mockRedis as RedisService,
      mockAudit as AuditService,
      mockConfig as ConfigService,
    );
  });

  describe('recordManualConsent', () => {
    it('should validate mandatory reason (1-500 chars) and succeed with valid input', async () => {
      const consent = await service.recordManualConsent(
        {
          clientId: 'client-1',
          status: ConsentStatus.OPTED_IN,
          reason: 'Client requested WhatsApp updates in person',
          evidenceReference: 'KYC_FORM_123',
        },
        'operator-1',
      );

      expect(consent.id).toBe('consent-record-1');
      expect(mockPrisma.whatsappConsent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-1',
            consentStatus: ConsentStatus.OPTED_IN,
            reason: 'Client requested WhatsApp updates in person',
            recordedByUserId: 'operator-1',
          }),
        }),
      );
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-1' },
          data: { communicationConsent: ConsentStatus.OPTED_IN },
        }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith('consent:suppressed:client-1');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('should reject missing or empty reason', async () => {
      await expect(
        service.recordManualConsent({
          clientId: 'client-1',
          status: ConsentStatus.OPTED_IN,
          reason: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject reason exceeding 500 characters', async () => {
      await expect(
        service.recordManualConsent({
          clientId: 'client-1',
          status: ConsentStatus.OPTED_IN,
          reason: 'A'.repeat(501),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject evidence reference exceeding 2048 characters', async () => {
      await expect(
        service.recordManualConsent({
          clientId: 'client-1',
          status: ConsentStatus.OPTED_IN,
          reason: 'Valid reason',
          evidenceReference: 'X'.repeat(2049),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should set Redis suppression key when recording OPTED_OUT', async () => {
      await service.recordManualConsent(
        {
          clientId: 'client-1',
          status: ConsentStatus.OPTED_OUT,
          reason: 'Client opted out by phone call',
        },
        'operator-1',
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'consent:suppressed:client-1',
        'OPTED_OUT',
        'EX',
        86400 * 365,
      );
      expect(mockPrisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1', consentVerified: true },
        data: { suppressed: true, consentVerified: false },
      });
    });
  });

  describe('handleInboundOptOut', () => {
    it('should immediately set Redis suppression key and append WHATSAPP_REPLY consent entry', async () => {
      const result = await service.handleInboundOptOut({
        clientId: 'client-1',
        keyword: 'STOP',
      });

      expect(result.success).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'consent:suppressed:client-1',
        'OPTED_OUT',
        'EX',
        86400 * 365,
      );
      expect(mockPrisma.whatsappConsent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-1',
            consentStatus: ConsentStatus.OPTED_OUT,
            consentSource: ConsentSource.WHATSAPP_REPLY,
            reason: expect.stringContaining('STOP'),
          }),
        }),
      );
      expect(mockPrisma.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-1' },
          data: { communicationConsent: ConsentStatus.OPTED_OUT },
        }),
      );
      expect(mockPrisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { clientId: 'client-1', consentVerified: true },
        data: { suppressed: true, consentVerified: false },
      });
    });

    it('should fall back to DLQ on database failure while keeping Redis suppression active', async () => {
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('DB Connection Timeout'));
      const mockDlq = { add: jest.fn().mockResolvedValue({}) };
      (service as any).dlqQueue = mockDlq;

      await expect(
        service.handleInboundOptOut({
          clientId: 'client-1',
          keyword: 'UNSUBSCRIBE',
        }),
      ).rejects.toThrow('DB Connection Timeout');

      // Redis suppression must have been set BEFORE the DB call
      expect(mockRedis.set).toHaveBeenCalledWith(
        'consent:suppressed:client-1',
        'OPTED_OUT',
        'EX',
        86400 * 365,
      );
      // Fallback DLQ job added
      expect(mockDlq.add).toHaveBeenCalledWith(
        'failed-opt-out',
        expect.objectContaining({
          clientId: 'client-1',
          keyword: 'UNSUBSCRIBE',
        }),
        expect.objectContaining({ attempts: 10 }),
      );
    });
  });

  describe('getConsentHistory', () => {
    it('should retrieve full consent timeline ordered by recordedAt DESC', async () => {
      mockPrisma.whatsappConsent.findMany.mockResolvedValue([
        { id: 'c-3', consentStatus: ConsentStatus.OPTED_IN, recordedAt: new Date(2026, 1, 3) },
        { id: 'c-2', consentStatus: ConsentStatus.OPTED_OUT, recordedAt: new Date(2026, 1, 2) },
        { id: 'c-1', consentStatus: ConsentStatus.OPTED_IN, recordedAt: new Date(2026, 1, 1) },
      ]);

      const history = await service.getConsentHistory('client-1');

      expect(history).toHaveLength(3);
      expect(mockPrisma.whatsappConsent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'client-1' },
          orderBy: { recordedAt: 'desc' },
        }),
      );
    });

    it('should throw NotFoundException if client does not exist', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(service.getConsentHistory('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
