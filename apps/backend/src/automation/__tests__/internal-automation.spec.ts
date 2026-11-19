import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  InternalAutomationController,
  getISTDateMMDD,
  getISTYear,
  getISTDateString,
} from '../internal-automation.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ConsentService } from '../../consent/consent.service';
import { AuditService } from '../../audit/audit.service';
import { RedisService } from '../../redis/redis.service';
import {
  CampaignStatus,
  CampaignType,
  ConsentStatus,
  DeliveryStatus,
  TemplateCategory,
  TemplateStatus,
} from '@prisma/client';

describe('InternalAutomationController', () => {
  let controller: InternalAutomationController;
  let prisma: PrismaService;
  let redis: RedisService;
  let campaignsService: CampaignsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalAutomationController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                id: 'client-1',
                full_name: 'Rajesh Kumar',
                whatsapp_number: '+919876543210',
                preferred_language: 'en',
              },
            ]),
            campaign: {
              findMany: jest.fn().mockResolvedValue([
                {
                  id: 'camp-fest-1',
                  name: 'Diwali Special 2026',
                  templateId: 'tpl-diwali',
                  scheduledAt: new Date(),
                  resolvedRecipientCount: 100,
                },
              ]),
            },
            messageTemplate: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'tpl-bday-1',
                name: 'birthday_vip_wishes_v1',
                category: TemplateCategory.UTILITY,
                status: TemplateStatus.APPROVED,
                versions: [{ id: 'v1', versionNumber: 1, status: TemplateStatus.APPROVED }],
              }),
            },
            client: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'client-1',
                fullName: 'Rajesh Kumar',
                whatsappNumber: '+919876543210',
                accountStatus: 'ACTIVE',
                deletedAt: null,
                communicationConsent: ConsentStatus.OPTED_IN,
              }),
            },
            messageLog: {
              create: jest.fn().mockResolvedValue({}),
            },
            automationRule: {
              findFirst: jest.fn().mockResolvedValue(null),
            },
            automationExecution: {
              create: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: CampaignsService,
          useValue: {
            dispatch: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: ConsentService,
          useValue: {
            handleInboundOptOut: jest.fn().mockResolvedValue({ success: true, clientId: 'client-1' }),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null),
          },
        },
        {
          provide: 'CAMPAIGN_QUEUE',
          useValue: {
            add: jest.fn().mockResolvedValue({ id: 'job-1' }),
          },
        },
      ],
    }).compile();

    controller = module.get<InternalAutomationController>(InternalAutomationController);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);
    campaignsService = module.get<CampaignsService>(CampaignsService);
  });

  describe('Asia/Kolkata Timezone Boundary Calculation', () => {
    it('should compute MM-DD correctly for 23:59 IST boundary (UTC 18:29 previous day)', () => {
      // 2026-11-19 18:29:00 UTC = 2026-11-19 23:59:00 IST
      const date2359IST = new Date('2026-11-19T18:29:00.000Z');
      expect(getISTDateMMDD(date2359IST)).toBe('11-19');
    });

    it('should compute MM-DD correctly across midnight boundary at 00:01 IST (UTC 18:31 previous day)', () => {
      // 2026-11-19 18:31:00 UTC = 2026-11-20 00:01:00 IST
      const date0001IST = new Date('2026-11-19T18:31:00.000Z');
      expect(getISTDateMMDD(date0001IST)).toBe('11-20');
    });

    it('should compute Year correctly in Asia/Kolkata timezone', () => {
      const newYearEveUTC = new Date('2026-12-31T18:35:00.000Z'); // 2027-01-01 00:05:00 IST
      expect(getISTYear(newYearEveUTC)).toBe(2027);
    });
  });

  describe('GET /automation/birthday-clients & anniversary-clients', () => {
    it('should query birthday clients using Asia/Kolkata date format', async () => {
      const result = await controller.getBirthdayClients('11-19');
      expect(result.date).toBe('11-19');
      expect(result.timezone).toBe('Asia/Kolkata');
      expect(result.count).toBe(1);
      expect(result.clients[0].full_name).toBe('Rajesh Kumar');
    });

    it('should query anniversary clients using Asia/Kolkata date format', async () => {
      const result = await controller.getAnniversaryClients('11-19');
      expect(result.date).toBe('11-19');
      expect(result.timezone).toBe('Asia/Kolkata');
      expect(result.count).toBe(1);
    });
  });

  describe('GET /automation/festival-scheduled-today', () => {
    it('should query approved festival campaigns scheduled for today in Asia/Kolkata', async () => {
      const result = await controller.getFestivalScheduledToday('2026-11-19');

      expect(result.date).toBe('2026-11-19');
      expect(result.timezone).toBe('Asia/Kolkata');
      expect(result.count).toBe(1);
      expect(result.campaigns[0].name).toBe('Diwali Special 2026');

      expect(prisma.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            campaignType: CampaignType.FESTIVAL,
            status: { in: [CampaignStatus.APPROVED, CampaignStatus.SCHEDULED] },
            dispatchedAt: null,
          }),
        }),
      );
    });
  });

  describe('POST /campaigns/batch-enqueue', () => {
    it('should successfully enqueue clients and return real counts', async () => {
      const body = {
        type: 'BIRTHDAY',
        items: [
          {
            id: 'client-1',
            full_name: 'Rajesh Kumar',
            whatsapp_number: '+919876543210',
          },
        ],
      };

      const result = await controller.batchEnqueue(body);

      expect(result.status).toBe('QUEUED');
      expect(result.type).toBe('BIRTHDAY');
      expect(result.processed).toBe(1);
      expect(result.enqueued).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.rejected).toBe(0);

      expect(prisma.messageLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-1',
            deliveryStatus: DeliveryStatus.QUEUED,
          }),
        }),
      );
    });

    it('should skip duplicate messages in same calendar year when P2002 unique violation occurs', async () => {
      // Simulate unique constraint violation on idempotency_key
      const p2002Err: any = new Error('Unique constraint failed on idempotency_key');
      p2002Err.code = 'P2002';
      jest.spyOn(prisma.messageLog, 'create').mockRejectedValueOnce(p2002Err);

      const body = {
        type: 'BIRTHDAY',
        items: [
          {
            id: 'client-1',
            full_name: 'Rajesh Kumar',
            whatsapp_number: '+919876543210',
          },
        ],
      };

      const result = await controller.batchEnqueue(body);

      expect(result.enqueued).toBe(0);
      expect(result.skipped).toBe(1); // Successfully skipped annual duplicate!
      expect(result.rejected).toBe(0);
    });

    it('should reject client if consent is not OPTED_IN or client is suppressed', async () => {
      jest.spyOn(prisma.client, 'findUnique').mockResolvedValueOnce({
        id: 'client-1',
        fullName: 'Rajesh Kumar',
        whatsappNumber: '+919876543210',
        accountStatus: 'ACTIVE',
        deletedAt: null,
        communicationConsent: ConsentStatus.OPTED_OUT,
      } as any);

      const body = {
        type: 'BIRTHDAY',
        items: [{ id: 'client-1', full_name: 'Rajesh Kumar' }],
      };

      const result = await controller.batchEnqueue(body);

      expect(result.enqueued).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.rejected).toBe(1);
      expect(prisma.messageLog.create).not.toHaveBeenCalled();
    });

    it('should normalize nested clients arrays from n8n output', async () => {
      const body = {
        type: 'ANNIVERSARY',
        items: [
          {
            date: '11-19',
            count: 1,
            clients: [
              {
                id: 'client-1',
                full_name: 'Rajesh Kumar',
                whatsapp_number: '+919876543210',
              },
            ],
          },
        ],
      };

      const result = await controller.batchEnqueue(body);

      expect(result.processed).toBe(1);
      expect(result.enqueued).toBe(1);
    });
  });
});
