import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis.service';

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      publish: jest.fn().mockResolvedValue(1),
      on: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'REDIS_URL') return undefined;
              if (key === 'REDIS_HOST') return 'localhost';
              if (key === 'REDIS_PORT') return 6379;
              if (key === 'REDIS_PASSWORD') return 'redis_password123';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    // Replace internal client with mock for unit test isolation
    (service as any).client = mockRedisClient;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('ping', () => {
    it('should return true when Redis responds with PONG', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      const result = await service.ping();
      expect(result).toBe(true);
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should return false when Redis throws an error', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));
      const result = await service.ping();
      expect(result).toBe(false);
    });
  });

  describe('Lockout counter', () => {
    it('should increment lockout and set TTL on first failure', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      const attempts = await service.incrementLockout('user-1', 900);
      expect(attempts).toBe(1);
      expect(mockRedisClient.incr).toHaveBeenCalledWith('auth:lockout:user-1');
      expect(mockRedisClient.expire).toHaveBeenCalledWith('auth:lockout:user-1', 900);
    });

    it('should increment lockout without resetting TTL on subsequent failures', async () => {
      mockRedisClient.incr.mockResolvedValue(3);
      const attempts = await service.incrementLockout('user-1', 900);
      expect(attempts).toBe(3);
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    it('should get current lockout count', async () => {
      mockRedisClient.get.mockResolvedValue('4');
      const count = await service.getLockout('user-1');
      expect(count).toBe(4);
      expect(mockRedisClient.get).toHaveBeenCalledWith('auth:lockout:user-1');
    });

    it('should clear lockout key', async () => {
      await service.clearLockout('user-1');
      expect(mockRedisClient.del).toHaveBeenCalledWith('auth:lockout:user-1');
    });
  });

  describe('Token Denylist', () => {
    it('should denylist token with TTL', async () => {
      await service.denylistToken('jti-123', 900);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'auth:denylist:jti-123',
        'revoked',
        'EX',
        900,
      );
    });

    it('should return true if token is denylisted', async () => {
      mockRedisClient.exists.mockResolvedValue(1);
      const isDenylisted = await service.isTokenDenylisted('jti-123');
      expect(isDenylisted).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith('auth:denylist:jti-123');
    });

    it('should return false if token is not denylisted', async () => {
      mockRedisClient.exists.mockResolvedValue(0);
      const isDenylisted = await service.isTokenDenylisted('jti-456');
      expect(isDenylisted).toBe(false);
    });
  });

  describe('Activity Tracking', () => {
    it('should set activity timestamp with 3600s TTL', async () => {
      await service.setActivity('user-1', 3600);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'auth:activity:user-1',
        expect.any(String),
        'EX',
        3600,
      );
    });

    it('should return true if session is expired (no activity key)', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const expired = await service.isSessionExpired('user-1', 3600);
      expect(expired).toBe(true);
    });

    it('should return false if activity is recent', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      mockRedisClient.get.mockResolvedValue(nowSec.toString());
      const expired = await service.isSessionExpired('user-1', 3600);
      expect(expired).toBe(false);
    });

    it('should return true if activity is older than 3600 seconds', async () => {
      const pastSec = Math.floor(Date.now() / 1000) - 3601;
      mockRedisClient.get.mockResolvedValue(pastSec.toString());
      const expired = await service.isSessionExpired('user-1', 3600);
      expect(expired).toBe(true);
    });
  });

  describe('Role Invalidation', () => {
    it('should set invalidation timestamp and publish to channel', async () => {
      await service.invalidateUserTokens('user-1', 900);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'auth:invalidate:user-1',
        expect.any(String),
        'EX',
        900,
      );
      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'auth:invalidate',
        expect.stringContaining('user-1'),
      );
    });

    it('should identify token revoked by role change', async () => {
      const invalidationTime = Math.floor(Date.now() / 1000);
      mockRedisClient.get.mockResolvedValue(invalidationTime.toString());

      // Token issued before role change (iat <= invalidationTime)
      const isRevoked = await service.isTokenRevokedByRoleChange(
        'user-1',
        invalidationTime - 10,
      );
      expect(isRevoked).toBe(true);

      // Token issued after role change (iat > invalidationTime)
      const isNotRevoked = await service.isTokenRevokedByRoleChange(
        'user-1',
        invalidationTime + 10,
      );
      expect(isNotRevoked).toBe(false);
    });
  });
});
