import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CampaignWorker, SendMessageJobPayload } from '../campaign.worker';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { MetaMessagesAdapter } from '../../templates/meta-messages.adapter';
import {
  ConsentStatus,
  DeliveryStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';
import { Job } from 'bullmq';

describe('CampaignWorker', () => {
  let worker: CampaignWorker;
  let prisma: PrismaService;
  let redis: RedisService;
  let metaAdapter: MetaMessagesAdapter;
  let configService: ConfigService;

  const mockClient = {
    id: 'client-uuid-1',
    fullName: 'Rajesh Kumar',
    whatsappNumber: '+919876543210',
    deletedAt: null,
    accountStatus: 'ACTIVE',
    communicationConsent: ConsentStatus.OPTED_IN,
  };

  const mockTemplate = {
    id: 'tpl-uuid-1',
    name: 'birthday_vip_wishes_v1',
    language: 'en',
    category: TemplateCategory.UTILITY,
    status: TemplateStatus.APPROVED,
    versions: [
      {
        id: 'ver-uuid-1',
        versionNumber: 1,
        status: TemplateStatus.APPROVED,
        bodyText: 'Happy Birthday {{1}}!',
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignWorker,
        {
          provide: PrismaService,
          useValue: {
            client: {
              findUnique: jest.fn().mockResolvedValue(mockClient),
            },
            messageTemplate: {
              findUnique: jest.fn().mockResolvedValue(mockTemplate),
            },
            campaign: {
              findUnique: jest.fn().mockResolvedValue(null),
              update: jest.fn().mockResolvedValue({}),
            },
            messageLog: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              count: jest.fn().mockResolvedValue(0),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: MetaMessagesAdapter,
          useValue: {
            sendMessage: jest.fn().mockResolvedValue({
              success: true,
              wamid: 'wamid.HBgMTest123',
              mockMode: true,
            }),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'WORKER_CONCURRENCY') return '10';
              if (key === 'COMPLIANCE_VERIFIED') return 'true';
              return null;
            }),
          },
        },
      ],
    }).compile();

    worker = module.get<CampaignWorker>(CampaignWorker);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);
    metaAdapter = module.get<MetaMessagesAdapter>(MetaMessagesAdapter);
    configService = module.get<ConfigService>(ConfigService);
  });

  const createMockJob = (payload: Partial<SendMessageJobPayload>): Job<SendMessageJobPayload> => {
    return {
      id: 'job-1',
      data: {
        clientId: 'client-uuid-1',
        phone: '+919876543210',
        clientName: 'Rajesh Kumar',
        templateId: 'tpl-uuid-1',
        idempotencyKey: 'idemp-key-123',
        ...payload,
      },
      attemptsMade: 0,
    } as any;
  };

  describe('Successful Processing', () => {
    it('should validate client consent, render template, invoke adapter, and mark SENT', async () => {
      const job = createMockJob({});
      const result = await worker.processJob(job);

      expect(result.status).toBe('SENT');
      expect(result.wamid).toBe('wamid.HBgMTest123');
      expect(metaAdapter.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '+919876543210',
          templateName: 'birthday_vip_wishes_v1',
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: 'Rajesh Kumar' }],
            },
          ],
        }),
      );
      expect(prisma.messageLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idempotencyKey: 'idemp-key-123' },
          data: expect.objectContaining({
            deliveryStatus: DeliveryStatus.SENT,
            metaMessageId: 'wamid.HBgMTest123',
          }),
        }),
      );
    });
  });

  describe('Zero-Tolerance Consent Enforcement', () => {
    it('should abort dispatch and mark FAILED if client communication consent is not OPTED_IN', async () => {
      jest.spyOn(prisma.client, 'findUnique').mockResolvedValueOnce({
        ...mockClient,
        communicationConsent: ConsentStatus.OPTED_OUT,
      } as any);

      const job = createMockJob({});
      const result = await worker.processJob(job);

      expect(result.status).toBe('DISCARDED');
      expect(result.reason).toBe('CONSENT_NOT_OPTED_IN');
      expect(metaAdapter.sendMessage).not.toHaveBeenCalled();
      expect(prisma.messageLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: DeliveryStatus.FAILED,
            errorCode: 'CONSENT_REVOKED',
          }),
        }),
      );
    });

    it('should abort dispatch if recipient phone is suppressed in Redis', async () => {
      jest.spyOn(redis, 'get').mockResolvedValueOnce('STOP_REQUESTED');

      const job = createMockJob({});
      const result = await worker.processJob(job);

      expect(result.status).toBe('DISCARDED');
      expect(result.reason).toBe('REDIS_SUPPRESSED');
      expect(metaAdapter.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling and Retry Behavior', () => {
    it('should mark FAILED without throwing when adapter returns a PERMANENT error', async () => {
      jest.spyOn(metaAdapter, 'sendMessage').mockResolvedValueOnce({
        success: false,
        mockMode: false,
        errorCode: '132000',
        errorMessage: 'Template does not exist',
        errorCategory: 'PERMANENT',
      });

      const job = createMockJob({});
      const result = await worker.processJob(job);

      expect(result.status).toBe('FAILED');
      expect(result.reason).toBe('132000');
      expect(prisma.messageLog.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: DeliveryStatus.FAILED,
            errorCode: '132000',
          }),
        }),
      );
    });

    it('should throw an Error to trigger BullMQ exponential retry when adapter returns a TRANSIENT error', async () => {
      jest.spyOn(metaAdapter, 'sendMessage').mockResolvedValueOnce({
        success: false,
        mockMode: false,
        errorCode: '130429',
        errorMessage: 'Rate limit hit',
        errorCategory: 'TRANSIENT',
      });

      const job = createMockJob({});

      await expect(worker.processJob(job)).rejects.toThrow(
        /Transient Meta dispatch failure/,
      );
    });

    it('should mark FAILED and not retry when an AMBIGUOUS timeout occurs', async () => {
      jest.spyOn(metaAdapter, 'sendMessage').mockResolvedValueOnce({
        success: false,
        mockMode: false,
        errorCode: 'AMBIGUOUS_TIMEOUT',
        errorMessage: 'Meta API HTTP request timed out',
        errorCategory: 'AMBIGUOUS',
      });

      const job = createMockJob({});
      const result = await worker.processJob(job);

      expect(result.status).toBe('FAILED');
      expect(result.reason).toBe('AMBIGUOUS_TIMEOUT');
    });
  });
});
