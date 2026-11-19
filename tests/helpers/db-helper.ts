import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TEST_USERS } from '../fixtures/users.fixture';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wt_app:wt_password123@localhost:5435/wt_whatsapp?schema=public';

export class DbHelper {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: DATABASE_URL,
        },
      },
    });
  }

  /** Direct access to PrismaClient */
  public get client(): PrismaClient {
    return this.prisma;
  }

  /**
   * Seeds test users for all 5 roles if they do not already exist in the database.
   */
  public async ensureTestUsersExist(): Promise<void> {
    for (const user of Object.values(TEST_USERS)) {
      const existing = await this.prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existing) {
        const passwordHash = await bcrypt.hash(user.password, 10);
        await this.prisma.user.create({
          data: {
            ...(user.id ? { id: user.id } : {}),
            email: user.email,
            passwordHash,
            fullName: user.fullName,
            role: user.role as UserRole,
            accountStatus: user.accountStatus,
          },
        });
      }
    }
  }

  /**
   * Cleans up transient test records created during test runs.
   * Preserves core seeded users and application settings.
   */
  public async cleanTestFixtures(): Promise<void> {
    // Clean webhook events
    await this.prisma.webhookEvent.deleteMany({
      where: { metaMessageId: { startsWith: 'test_' } },
    });

    // Clean campaign recipients & message logs for test campaigns
    await this.prisma.messageLog.deleteMany({
      where: { idempotencyKey: { startsWith: 'test_' } },
    });

    await this.prisma.campaignRecipient.deleteMany({
      where: { campaign: { name: { startsWith: 'TEST_' } } },
    });

    await this.prisma.campaignStateTransition.deleteMany({
      where: { campaign: { name: { startsWith: 'TEST_' } } },
    });

    await this.prisma.campaign.deleteMany({
      where: { name: { startsWith: 'TEST_' } },
    });

    // Clean test template versions and templates
    await this.prisma.templateVersion.deleteMany({
      where: { template: { name: { startsWith: 'test_' } } },
    });

    await this.prisma.messageTemplate.deleteMany({
      where: { name: { startsWith: 'test_' } },
    });

    // Clean test campaign recipients and message logs before clients to prevent foreign key errors
    await this.prisma.campaignRecipient.deleteMany({
      where: {
        OR: [
          { client: { whatsappNumber: { startsWith: '+9199999' } } },
          { client: { email: { endsWith: '@test.wealthtrade.in' } } },
        ],
      },
    });

    await this.prisma.messageLog.deleteMany({
      where: {
        OR: [
          { client: { whatsappNumber: { startsWith: '+9199999' } } },
          { client: { email: { endsWith: '@test.wealthtrade.in' } } },
        ],
      },
    });

    // Clean test consents and clients
    await this.prisma.whatsappConsent.deleteMany({
      where: { client: { whatsappNumber: { startsWith: '+9199999' } } },
    });

    await this.prisma.clientTag.deleteMany({
      where: { client: { whatsappNumber: { startsWith: '+9199999' } } },
    });

    await this.prisma.client.deleteMany({
      where: {
        OR: [
          { whatsappNumber: { startsWith: '+9199999' } },
          { email: { endsWith: '@test.wealthtrade.in' } },
        ],
      },
    });
  }

  /**
   * Finds a client by WhatsApp phone number.
   */
  public async findClientByPhone(whatsappNumber: string) {
    return this.prisma.client.findUnique({
      where: { whatsappNumber },
      include: {
        consentRecords: { orderBy: { recordedAt: 'desc' } },
        tags: true,
      },
    });
  }

  /**
   * Finds a user by email.
   */
  public async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Executes a raw SQL query safely.
   */
  public async executeRaw(query: string) {
    return this.prisma.$queryRawUnsafe(query);
  }

  /**
   * Closes database connection cleanly.
   */
  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const dbHelper = new DbHelper();
