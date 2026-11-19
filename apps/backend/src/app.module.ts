import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClientsModule } from './clients/clients.module';
import { ConsentModule } from './consent/consent.module';
import { TemplatesModule } from './templates/templates.module';
import { MediaModule } from './media/media.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AutomationModule } from './automation/automation.module';
import { AuditModule } from './audit/audit.module';
import { QueueModule } from './queue/queue.module';
import { QueueWorkerModule } from './queue/queue.worker.module';
import { SettingsModule } from './settings/settings.module';
import { HealthModule } from './health/health.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    // ── Configuration (global) ──────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ── Rate limiting ───────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 60000,   // 1 minute
        limit: (process.env['NODE_ENV'] === 'test' || process.env['NODE_ENV'] === 'development') ? 10000 : 100,   // 100 req/min per authenticated user
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: (process.env['NODE_ENV'] === 'test' || process.env['NODE_ENV'] === 'development') ? 10000 : 20,    // 20 req/min for unauthenticated endpoints
      },
    ]),

    // ── Core infrastructure ─────────────────────────────────────────────────
    PrismaModule,
    RedisModule,
    QueueModule,
    QueueWorkerModule,

    // ── Feature modules ─────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    ClientsModule,
    ConsentModule,
    TemplatesModule,
    MediaModule,
    CampaignsModule,
    WebhooksModule,
    AnalyticsModule,
    AutomationModule,
    AuditModule,
    SettingsModule,
    HealthModule,
  ],
  providers: [
    // Global throttler guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // JWT auth guard (order: JWT → Roles → Permissions)
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Role-based access guard
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useFactory: (): GlobalExceptionFilter => {
        const nodeEnv = process.env['NODE_ENV'] ?? 'development';
        return new GlobalExceptionFilter(nodeEnv);
      },
    },
    // Global audit interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
