import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { UserRole, AccountStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    redis = app.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    // Clean up any test users created during E2E tests
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['testlockout@wealthtrade.in', 'totp-e2e@wealthtrade.in'],
        },
      },
    });
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate seeded Super_Admin and return RS256 token pair', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'superadmin@wealthtrade.in',
          password: 'SuperAdmin@2026!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('expiresIn', 900);
      expect(response.body.user).toMatchObject({
        email: 'superadmin@wealthtrade.in',
        role: UserRole.Super_Admin,
        fullName: 'System Super Admin',
      });
    });

    it('should reject invalid password with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@wealthtrade.in',
          password: 'WrongPassword@123',
        })
        .expect(401);
    });

    it('should enforce account lockout after 5 consecutive failed login attempts', async () => {
      const email = 'testlockout@wealthtrade.in';
      const password = 'CorrectPassword@2026!';
      const passwordHash = await bcrypt.hash(password, 12);

      // Upsert dedicated test user
      const testUser = await prisma.user.upsert({
        where: { email },
        update: {
          accountStatus: AccountStatus.ACTIVE,
          failedLoginCount: 0,
          lockedAt: null,
          passwordHash,
        },
        create: {
          email,
          fullName: 'Lockout Test Subject',
          passwordHash,
          role: UserRole.Operator,
          accountStatus: AccountStatus.ACTIVE,
        },
      });

      await redis.clearLockout(testUser.id);

      // Attempts 1 to 4: Fail with 401
      for (let i = 1; i <= 4; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'BadPassword!' })
          .expect(401);
        expect(res.body.message).toContain('Invalid email or password');
      }

      // Attempt 5: Reaches limit, locks account, throws 401 lockout message
      const fifthAttempt = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'BadPassword!' })
        .expect(401);

      expect(fifthAttempt.body.message).toContain('locked');

      // Verify in DB that accountStatus is LOCKED and lockedAt is set
      const dbUser = await prisma.user.findUnique({ where: { id: testUser.id } });
      expect(dbUser?.accountStatus).toBe(AccountStatus.LOCKED);
      expect(dbUser?.lockedAt).not.toBeNull();

      // Attempt 6 with CORRECT password: Still rejected because account is LOCKED
      const sixthAttempt = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);

      expect(sixthAttempt.body.message).toContain('locked');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should rotate refresh token and reject old token reuse', async () => {
      // 1. Initial Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'admin@wealthtrade.in',
          password: 'Admin@2026!',
        })
        .expect(200);

      const firstRefreshToken = loginRes.body.refreshToken;

      // 2. Refresh token rotation
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(200);

      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');
      expect(refreshRes.body.refreshToken).not.toBe(firstRefreshToken);

      // 3. Attempting to reuse old refresh token MUST be rejected with 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me and POST /api/v1/auth/logout', () => {
    it('should return profile for authenticated user and invalidate token upon logout', async () => {
      // 1. Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'marketing@wealthtrade.in',
          password: 'Marketing@2026!',
        })
        .expect(200);

      const accessToken = loginRes.body.accessToken;
      const refreshToken = loginRes.body.refreshToken;

      // 2. Access protected /me endpoint
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body.email).toBe('marketing@wealthtrade.in');
      expect(meRes.body.role).toBe(UserRole.Marketing_Employee);

      // 3. Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // 4. Accessing /me with the logged out access token MUST now fail with 401 (denylisted in Redis)
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('should reject unauthenticated request with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    });
  });

  describe('TOTP 2FA flow', () => {
    it('should setup TOTP and verify code enabling 2FA', async () => {
      const email = 'totp-e2e@wealthtrade.in';
      const password = 'TotpPassword@2026!';
      const passwordHash = await bcrypt.hash(password, 12);

      await prisma.user.upsert({
        where: { email },
        update: {
          accountStatus: AccountStatus.ACTIVE,
          totpEnabled: false,
          totpSecret: null,
          passwordHash,
        },
        create: {
          email,
          fullName: 'TOTP Test Subject',
          passwordHash,
          role: UserRole.Operator,
          accountStatus: AccountStatus.ACTIVE,
        },
      });

      // Login
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);

      const token = loginRes.body.accessToken;

      // Setup TOTP
      const setupRes = await request(app.getHttpServer())
        .post('/api/v1/auth/totp/setup')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(setupRes.body).toHaveProperty('secret');
      expect(setupRes.body).toHaveProperty('qrCodeDataUrl');

      const secret = setupRes.body.secret;
      const validTotp = speakeasy.totp({
        secret,
        encoding: 'base32',
      });

      // Verify TOTP
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/totp/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: validTotp })
        .expect(200);

      expect(verifyRes.body).toEqual({ success: true });

      // Check DB totpEnabled is now true
      const updatedUser = await prisma.user.findUnique({ where: { email } });
      expect(updatedUser?.totpEnabled).toBe(true);

      // Subsequent login requires TOTP code
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(401);

      // Login with valid TOTP code succeeds
      const currentCode = speakeasy.totp({ secret, encoding: 'base32' });
      const mfaLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password, totpCode: currentCode })
        .expect(200);

      expect(mfaLogin.body).toHaveProperty('accessToken');
    });
  });
});
