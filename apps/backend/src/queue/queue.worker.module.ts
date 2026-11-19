import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CampaignWorker } from './campaign.worker';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../audit/audit.module';
import { TemplatesModule } from '../templates/templates.module';
import { QueueModule } from './queue.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ConfigModule,
    AuditModule,
    TemplatesModule,
    QueueModule,
  ],
  providers: [CampaignWorker],
  exports: [CampaignWorker],
})
export class QueueWorkerModule {}
