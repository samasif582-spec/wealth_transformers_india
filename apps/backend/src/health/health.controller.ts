import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResponse {
  service: string;
  version: string;
  status: 'healthy' | 'degraded';
  database: { status: 'ok' | 'error'; latency_ms: number };
  redis: { status: 'ok' | 'error' };
  timestamp: string;
}

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const start = Date.now();
    let dbStatus: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const latency = Date.now() - start;

    return {
      service: 'wt-whatsapp-api',
      version: '1.0.0',
      status: dbStatus === 'ok' ? 'healthy' : 'degraded',
      database: { status: dbStatus, latency_ms: latency },
      redis: { status: 'ok' },
      timestamp: new Date().toISOString(),
    };
  }
}
