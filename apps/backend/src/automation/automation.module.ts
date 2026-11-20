import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AutomationController } from './automation.controller';
import { InternalAutomationController } from './internal-automation.controller';
import { AutomationService } from './automation.service';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ConsentModule } from '../consent/consent.module';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    RedisModule,
    QueueModule,
    forwardRef(() => CampaignsModule),
    forwardRef(() => ConsentModule),
    forwardRef(() => TemplatesModule),
    AuditModule,
  ],
  controllers: [AutomationController, InternalAutomationController],
  providers: [AutomationService, InternalApiKeyGuard],
  exports: [AutomationService, InternalApiKeyGuard],
})
export class AutomationModule {}
