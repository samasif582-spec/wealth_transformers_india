import { ConfigService } from '@nestjs/config';
import { ConnectionOptions, DefaultJobOptions } from 'bullmq';

export const QUEUE_NAMES = {
  CAMPAIGN_MESSAGES: 'campaign-messages',
  WEBHOOK_PROCESSING: 'webhook-processing',
  CONSENT_DLQ: 'consent-dlq',
  TEMPLATE_STATUS_POLL: 'template-status-poll',
  TEMPLATE_QUALITY_SYNC: 'template-quality-sync',
  CLIENT_EXPORT: 'client-export',
  CAMPAIGN_REPORT_EXPORT: 'campaign-report-export',
  AUDIT_ARCHIVE: 'audit-archive',
  RETENTION_CLEANUP: 'retention-cleanup',
  DB_BACKUP: 'db-backup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 30000, // 30 seconds initial delay
  },
  removeOnComplete: { age: 86400 },   // Keep completed jobs for 24h
  removeOnFail: { age: 604800 },      // Keep failed jobs for 7d
};

export function getRedisConnection(config: ConfigService): ConnectionOptions {
  const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '6379', 10),
      password: url.password || config.get<string>('REDIS_PASSWORD'),
      tls: url.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}
