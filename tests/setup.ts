import * as dotenv from 'dotenv';
import * as path from 'path';
import * as http from 'http';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Load workspace root .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wt_app:wt_password123@localhost:5435/wt_whatsapp?schema=public';
const REDIS_URL = process.env.REDIS_URL || 'redis://:redis_password123@localhost:6379';

let sharedPrisma: PrismaClient | null = null;
let sharedRedis: Redis | null = null;
let isBackendPreChecked = false;

export async function checkBackendServer(url = 'http://127.0.0.1:3000/api/v1/health'): Promise<{ ok: boolean; status: number; body?: unknown }> {
  if (isBackendPreChecked) {
    return { ok: true, status: 200 };
  }
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: u.pathname + u.search,
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              isBackendPreChecked = true;
            }
            try {
              const body = JSON.parse(data);
              resolve({ ok: res.statusCode === 200, status: res.statusCode || 0, body });
            } catch {
              resolve({ ok: res.statusCode === 200, status: res.statusCode || 0, body: data });
            }
          });
        },
      );
      req.on('error', (err) => {
        resolve({ ok: false, status: 0, body: err.message });
      });
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, body: 'Timeout' });
      });
    } catch (err: unknown) {
      resolve({ ok: false, status: 0, body: (err as Error).message });
    }
  });
}

export async function checkPostgresConnectivity(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!sharedPrisma) {
      sharedPrisma = new PrismaClient({
        datasources: { db: { url: DATABASE_URL } },
      });
    }
    await sharedPrisma.$queryRawUnsafe('SELECT 1 as connected');
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function checkRedisConnectivity(): Promise<{ ok: boolean; ping?: string; error?: string }> {
  try {
    if (!sharedRedis) {
      sharedRedis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });
      await sharedRedis.connect();
    }
    const pong = await sharedRedis.ping();
    return { ok: pong === 'PONG', ping: pong };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

// Global Jest hooks
beforeAll(async () => {
  // Pre-flight checks
  const [backendCheck, dbCheck, redisCheck] = await Promise.all([
    checkBackendServer(),
    checkPostgresConnectivity(),
    checkRedisConnectivity(),
  ]);

  if (!backendCheck.ok) {
    console.warn(`[Pre-Flight Warning] Backend server at ${API_BASE_URL} responded with: ${JSON.stringify(backendCheck.body)}`);
  }
  if (!dbCheck.ok) {
    console.warn(`[Pre-Flight Warning] PostgreSQL connectivity check failed: ${dbCheck.error}`);
  }
  if (!redisCheck.ok) {
    console.warn(`[Pre-Flight Warning] Redis connectivity check failed: ${redisCheck.error}`);
  }
});

afterAll(async () => {
  if (sharedPrisma) {
    await sharedPrisma.$disconnect().catch(() => {});
    sharedPrisma = null;
  }
  if (sharedRedis) {
    await sharedRedis.quit().catch(() => {});
    sharedRedis = null;
  }
});
