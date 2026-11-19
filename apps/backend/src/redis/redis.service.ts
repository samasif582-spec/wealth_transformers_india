import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    const redisPassword = this.config.get<string>('REDIS_PASSWORD', 'redis_password123');

    if (redisUrl) {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    } else {
      this.client = new Redis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        password: redisPassword,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    }

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis client error: ${err.message}`, err.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.log('Connected to Redis successfully');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to connect to Redis: ${msg}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Error disconnecting Redis: ${msg}`);
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  // ─── Lockout Counter ────────────────────────────────────────────────────────
  // Key: auth:lockout:{userId}
  // 5 failed attempts in 15m locks account for 900s
  async incrementLockout(userId: string, ttlSeconds = 900): Promise<number> {
    const key = `auth:lockout:${userId}`;
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async getLockout(userId: string): Promise<number> {
    const key = `auth:lockout:${userId}`;
    const val = await this.client.get(key);
    return val ? parseInt(val, 10) : 0;
  }

  async clearLockout(userId: string): Promise<void> {
    const key = `auth:lockout:${userId}`;
    await this.client.del(key);
  }

  // ─── Token Denylist ─────────────────────────────────────────────────────────
  // Key: auth:denylist:{jti}
  async denylistToken(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;
    const key = `auth:denylist:${jti}`;
    await this.client.set(key, 'revoked', 'EX', ttlSeconds);
  }

  async isTokenDenylisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    const key = `auth:denylist:${jti}`;
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  // ─── Activity Tracking ──────────────────────────────────────────────────────
  // Key: auth:activity:{userId}
  async setActivity(userId: string, ttlSeconds = 3600): Promise<void> {
    const key = `auth:activity:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    await this.client.set(key, now.toString(), 'EX', ttlSeconds);
  }

  async getActivity(userId: string): Promise<number | null> {
    const key = `auth:activity:${userId}`;
    const val = await this.client.get(key);
    return val ? parseInt(val, 10) : null;
  }

  async clearActivity(userId: string): Promise<void> {
    const key = `auth:activity:${userId}`;
    await this.client.del(key);
  }

  async isSessionExpired(userId: string, maxInactivitySeconds = 3600): Promise<boolean> {
    const lastActivity = await this.getActivity(userId);
    if (!lastActivity) {
      // Key expired or never set
      return true;
    }
    const now = Math.floor(Date.now() / 1000);
    return now - lastActivity > maxInactivitySeconds;
  }

  // ─── Role Invalidation ──────────────────────────────────────────────────────
  // Key: auth:invalidate:{userId} & PubSub 'auth:invalidate'
  async invalidateUserTokens(userId: string, ttlSeconds = 900): Promise<void> {
    const key = `auth:invalidate:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    await this.client.set(key, now.toString(), 'EX', ttlSeconds);
    await this.client.publish(
      'auth:invalidate',
      JSON.stringify({ userId, timestamp: now }),
    );
  }

  async getUserInvalidationTime(userId: string): Promise<number | null> {
    const key = `auth:invalidate:${userId}`;
    const val = await this.client.get(key);
    return val ? parseInt(val, 10) : null;
  }

  async isTokenRevokedByRoleChange(userId: string, tokenIat?: number): Promise<boolean> {
    if (!tokenIat) return false;
    const invalidationTime = await this.getUserInvalidationTime(userId);
    if (!invalidationTime) return false;
    return tokenIat <= invalidationTime;
  }

  // ─── Generic Key-Value Helpers ──────────────────────────────────────────────
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, mode?: 'EX', duration?: number): Promise<string | null> {
    if (mode === 'EX' && duration) {
      return this.client.set(key, value, 'EX', duration);
    }
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }
}
