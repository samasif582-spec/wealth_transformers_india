import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, unknown>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.loadAllSettings();
    } catch {
      this.logger.warn('Could not load application settings on init (DB may not be ready yet)');
    }
  }

  async loadAllSettings(): Promise<void> {
    const settings = await this.prisma.applicationSetting.findMany();
    for (const setting of settings) {
      this.cache.set(setting.key, setting.value);
    }
    this.logger.log(`✅ Loaded ${settings.length} application settings into memory cache`);
  }

  async getAll() {
    return this.prisma.applicationSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  async update(key: string, value: any, actorId?: string) {
    const existing = await this.prisma.applicationSetting.findUnique({ where: { key } });

    const updated = await this.prisma.applicationSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value, updatedAt: new Date() },
    });

    this.cache.set(key, value);

    await this.auditService.log({
      actorId,
      actionType: 'UPDATE',
      resourceType: 'ApplicationSetting',
      resourceId: key,
      beforeState: existing ? { value: existing.value } : undefined,
      afterState: { value },
    });

    return updated;
  }
}
