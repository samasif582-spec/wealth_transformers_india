import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, getRedisConnection } from './queue.constants';

@Module({
  providers: [
    {
      provide: 'QUEUE_CONFIG',
      useFactory: (config: ConfigService) => getRedisConnection(config),
      inject: [ConfigService],
    },
  ],
  exports: ['QUEUE_CONFIG'],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name);

  async onModuleInit(): Promise<void> {
    const concurrency = parseInt(process.env['WORKER_CONCURRENCY'] ?? '10', 10);
    if (isNaN(concurrency) || concurrency < 1 || concurrency > 100) {
      this.logger.error(
        `Invalid WORKER_CONCURRENCY value: "${process.env['WORKER_CONCURRENCY']}". Must be integer 1–100.`,
      );
      process.exit(1);
    }
    this.logger.log(`✅ Queue module initialized | concurrency=${concurrency}`);
    this.logger.log(`📋 Registered queues: ${Object.values(QUEUE_NAMES).join(', ')}`);
  }
}
