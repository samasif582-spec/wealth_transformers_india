import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UserRole, AccountStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let redis: any;
  let jwt: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'operator@wealthtrade.in',
    passwordHash: '',
    fullName: 'Test Operator',
    role: UserRole.Operator,
    accountStatus: AccountStatus.ACTIVE,
    failedLoginCount: 0,
    lockedAt: null,
    totpSecret: null,
    totpEnabled: false,
    refreshTokenHash: null,
    lastActivityAt: null,
    deletedAt: null,
  };

  beforeAll(async () => {
    // Generate valid bcrypt hash with cost 12
    mockUser.passwordHash = await bcrypt.hash('SecurePassword@123', 12);
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    redis = {
      incrementLockout: jest.fn().mockResolvedValue(1),
      clearLockout: jest.fn().mockResolvedValue(undefined),
      denylistToken: jest.fn().mockResolvedValue(undefined),
      isTokenDenylisted: jest.fn().mockResolvedValue(false),
      setActivity: jest.fn().mockResolvedValue(undefined),
      clearActivity: jest.fn().mockResolvedValue(undefined),
      isSessionExpired: jest.fn().mockResolvedValue(false),
    };

    jwt = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
      verify: jest.fn().mockReturnValue({
        sub: mockUser.id,
        role: mockUser.role,
        jti: 'test-jti',
        exp: Math.floor(Date.now() / 1000) + 604800,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'JWT_ACCESS_TOKEN_TTL') return 900;
              if (key === 'JWT_REFRESH_TOKEN_TTL') return 604800;
              return defaultValue;
            }),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueTokenPair', () => {
    it('should generate access and refresh tokens with TTL', () => {
      const tokens = service.issueTokenPair(mockUser.id, mockUser.role);
      expect(tokens).toHaveProperty('accessToken', 'mock.jwt.token');
      expect(tokens).toHaveProperty('refreshToken', 'mock.jwt.token');
      expect(tokens).toHaveProperty('expiresIn', 900);
      expect(jwt.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('login', () => {
    it('should authenticate successfully with valid credentials and reset lockout counter', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'operator@wealthtrade.in',
        password: 'SecurePassword@123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(mockUser.email);
      expect(redis.clearLockout).toHaveBeenCalledWith(mockUser.id);
      expect(redis.setActivity).toHaveBeenCalledWith(mockUser.id, 3600);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({ failedLoginCount: 0 }),
        }),
      );
    });

    it('should throw 401 and increment lockout on invalid password', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);
      redis.incrementLockout.mockResolvedValue(2);

      await expect(
        service.login({
          email: 'operator@wealthtrade.in',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(redis.incrementLockout).toHaveBeenCalledWith(mockUser.id, 900);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: { failedLoginCount: 2 },
        }),
      );
    });

    it('should lock account at 5 failed attempts, record audit log, and throw 401', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        accountStatus: AccountStatus.LOCKED,
      });
      redis.incrementLockout.mockResolvedValue(5);

      await expect(
        service.login({
          email: 'operator@wealthtrade.in',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow('Account has been locked due to 5 consecutive failed login attempts.');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            accountStatus: AccountStatus.LOCKED,
            lockedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should reject login if account is already LOCKED', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        accountStatus: AccountStatus.LOCKED,
      });

      await expect(
        service.login({
          email: 'operator@wealthtrade.in',
          password: 'SecurePassword@123',
        }),
      ).rejects.toThrow('Account is locked due to consecutive failed attempts');
    });

    it('should require and verify TOTP code when totpEnabled is true', async () => {
      const secret = speakeasy.generateSecret({ length: 20 });
      const validCode = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      });

      const mfaUser = {
        ...mockUser,
        totpEnabled: true,
        totpSecret: secret.base32,
      };

      prisma.user.findFirst.mockResolvedValue(mfaUser);
      prisma.user.update.mockResolvedValue(mfaUser);

      // 1. Missing TOTP code
      await expect(
        service.login({
          email: 'operator@wealthtrade.in',
          password: 'SecurePassword@123',
        }),
      ).rejects.toThrow('TOTP code is required');

      // 2. Invalid TOTP code
      await expect(
        service.login({
          email: 'operator@wealthtrade.in',
          password: 'SecurePassword@123',
          totpCode: '000000',
        }),
      ).rejects.toThrow('Invalid TOTP verification code');

      // 3. Valid TOTP code
      const result = await service.login({
        email: 'operator@wealthtrade.in',
        password: 'SecurePassword@123',
        totpCode: validCode,
      });
      expect(result).toHaveProperty('accessToken');
    });
  });

  describe('refresh token rotation', () => {
    it('should rotate refresh token, denylist old JTI in Redis, and update DB hash', async () => {
      const rawRefreshToken = 'old.refresh.token';
      const hash = await bcrypt.hash(rawRefreshToken, 12);
      const userWithHash = {
        ...mockUser,
        refreshTokenHash: hash,
      };

      jwt.verify.mockReturnValue({
        sub: mockUser.id,
        role: mockUser.role,
        jti: 'old-jti',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      redis.isTokenDenylisted.mockResolvedValue(false);
      prisma.user.findFirst.mockResolvedValue(userWithHash);
      prisma.user.update.mockResolvedValue(userWithHash);

      const result = await service.refresh(rawRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(redis.denylistToken).toHaveBeenCalledWith('old-jti', expect.any(Number));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
          }),
        }),
      );
      expect(redis.setActivity).toHaveBeenCalledWith(mockUser.id, 3600);
    });

    it('should reject refresh if token JTI is already denylisted in Redis', async () => {
      jwt.verify.mockReturnValue({
        sub: mockUser.id,
        role: mockUser.role,
        jti: 'denylisted-jti',
      });
      redis.isTokenDenylisted.mockResolvedValue(true);

      await expect(service.refresh('token')).rejects.toThrow('Refresh token has been revoked');
    });

    it('should reject refresh and denylist token if hash does not match (reuse attack)', async () => {
      const hash = await bcrypt.hash('different.token', 12);
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        refreshTokenHash: hash,
      });
      redis.isTokenDenylisted.mockResolvedValue(false);
      jwt.verify.mockReturnValue({
        sub: mockUser.id,
        role: mockUser.role,
        jti: 'stolen-jti',
      });

      await expect(service.refresh('presented.token')).rejects.toThrow('Invalid refresh token');
      expect(redis.denylistToken).toHaveBeenCalledWith('stolen-jti', expect.any(Number));
    });
  });

  describe('logout', () => {
    it('should denylist tokens, clear DB hash, and clear Redis activity', async () => {
      prisma.user.update.mockResolvedValue(mockUser);
      jwt.verify.mockReturnValue({ jti: 'refresh-jti', exp: 123456789 });

      const result = await service.logout(mockUser.id, 'access-jti', 'refresh.token');
      expect(result).toEqual({ success: true });
      expect(redis.denylistToken).toHaveBeenCalledWith('access-jti', 900);
      expect(redis.denylistToken).toHaveBeenCalledWith('refresh-jti', expect.any(Number));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { refreshTokenHash: null },
      });
      expect(redis.clearActivity).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('getMe', () => {
    it('should return sanitized user profile', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        role: mockUser.role,
        accountStatus: mockUser.accountStatus,
        totpEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const user = await service.getMe(mockUser.id);
      expect(user).toBeDefined();
      expect(user.id).toBe(mockUser.id);
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getMe('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('TOTP setup and verify', () => {
    it('should setup TOTP and return secret and QR code URL', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.setupTotp(mockUser.id);
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('qrCodeDataUrl');
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { totpSecret: result.secret },
      });
    });

    it('should verify TOTP code and enable 2FA on the user', async () => {
      const secret = speakeasy.generateSecret({ length: 20 });
      const validCode = speakeasy.totp({
        secret: secret.base32,
        encoding: 'base32',
      });

      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        totpSecret: secret.base32,
      });
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.verifyTotp(mockUser.id, validCode);
      expect(result).toEqual({ success: true });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { totpEnabled: true },
      });
    });

    it('should reject invalid TOTP code during verification', async () => {
      prisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        totpSecret: 'JBSWY3DPEHPK3PXP',
      });

      await expect(service.verifyTotp(mockUser.id, '999999')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
