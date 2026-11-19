import Redis from 'ioredis';
import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const REDIS_URL = process.env.REDIS_URL || 'redis://:redis_password123@localhost:6379';

export interface BullMQJobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export class RedisHelper {
  private redis: Redis;
  private queues: Map<string, Queue> = new Map();

  constructor() {
    this.redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  /** Direct access to ioredis instance */
  public get client(): Redis {
    return this.redis;
  }

  /** PING Redis server */
  public async ping(): Promise<string> {
    return this.redis.ping();
  }

  // ─── Token Denylisting (auth:denylist:{jti}) ───

  public async isTokenDenylisted(jti: string): Promise<boolean> {
    const exists = await this.redis.exists(`auth:denylist:${jti}`);
    return exists === 1;
  }

  public async denylistToken(jti: string, ttlSeconds = 900): Promise<void> {
    await this.redis.set(`auth:denylist:${jti}`, 'revoked', 'EX', ttlSeconds);
  }

  public async removeTokenFromDenylist(jti: string): Promise<void> {
    await this.redis.del(`auth:denylist:${jti}`);
  }

  // ─── User Lockout (auth:lockout:{userId}) ───

  public async getLockoutCount(userId: string): Promise<number> {
    const val = await this.redis.get(`auth:lockout:${userId}`);
    return val ? parseInt(val, 10) : 0;
  }

  public async setLockoutCount(userId: string, count: number, ttlSeconds = 900): Promise<void> {
    await this.redis.set(`auth:lockout:${userId}`, count.toString(), 'EX', ttlSeconds);
  }

  public async resetLockout(userId: string): Promise<void> {
    await this.redis.del(`auth:lockout:${userId}`);
  }

  // ─── Activity Tracking (auth:activity:{userId}) ───

  public async getLastActivity(userId: string): Promise<number | null> {
    const val = await this.redis.get(`auth:activity:${userId}`);
    return val ? parseInt(val, 10) : null;
  }

  public async setLastActivity(userId: string, epochSeconds: number): Promise<void> {
    await this.redis.set(`auth:activity:${userId}`, epochSeconds.toString());
  }

  // ─── Dynamic Role Invalidation (auth:invalidate:{userId}) ───

  public async getRoleInvalidationTimestamp(userId: string): Promise<number | null> {
    const val = await this.redis.get(`auth:invalidate:${userId}`);
    return val ? parseInt(val, 10) : null;
  }

  public async setRoleInvalidation(userId: string, epochSeconds = Math.floor(Date.now() / 1000)): Promise<void> {
    await this.redis.set(`auth:invalidate:${userId}`, epochSeconds.toString());
  }

  // ─── Idempotency Keys (idempotency:*) ───

  public async getIdempotencyValue(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  public async setIdempotencyKey(key: string, value: string, ttlSeconds = 86400): Promise<boolean> {
    const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  // ─── BullMQ Inspection ───

  public getQueue(queueName = 'campaign-messages'): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: {
          host: this.redis.options.host || 'localhost',
          port: this.redis.options.port || 6379,
          password: this.redis.options.password,
        },
      });
      this.queues.set(queueName, queue);
    }
    return this.queues.get(queueName)!;
  }

  public async getQueueJobCounts(queueName = 'campaign-messages'): Promise<BullMQJobCounts> {
    const queue = this.getQueue(queueName);
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  public async obliterateQueue(queueName = 'campaign-messages'): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.obliterate({ force: true }).catch(() => {});
  }

  // ─── Lifecycle & Cleanup ───

  public async flushTestKeys(): Promise<void> {
    const keys = await this.redis.keys('*test*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  public async disconnect(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close().catch(() => {});
    }
    this.queues.clear();
    await this.redis.quit().catch(() => {});
  }
}

export const redisHelper = new RedisHelper();
