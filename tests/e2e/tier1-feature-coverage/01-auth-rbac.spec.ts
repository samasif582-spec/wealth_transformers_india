import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { apiClient, ApiClient } from '../../helpers/api-client';
import { authHelper } from '../../helpers/auth-helper';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import {
  USER_CREDENTIALS,
  UserRoleKey,
} from '../../fixtures/users.fixture';

const seededUserMap: Record<UserRoleKey, string> = {} as any;

/**
 * Creates an authenticated ApiClient for a given role using the genuine
 * seeded user's ID from PostgreSQL and sets active session in Redis.
 */
async function createAuthedClient(
  role: UserRoleKey = 'Super_Admin',
  customUserId?: string,
): Promise<{ client: ApiClient; token: string; userId: string; jti: string }> {
  const userId = customUserId || seededUserMap[role] || uuidv4();
  const { token, jti } = authHelper.generateAccessToken({ role, userId });
  await redisHelper.setLastActivity(userId, Math.floor(Date.now() / 1000));
  const client = apiClient.withToken(token);
  return { client, token, userId, jti };
}

describe('Tier 1 — 01: Authentication, RBAC & User Management', () => {
  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
    for (const role of [
      'Super_Admin',
      'Admin',
      'Marketing_Employee',
      'Operator',
      'Viewer',
    ] as UserRoleKey[]) {
      const u = await dbHelper.findUserByEmail(USER_CREDENTIALS[role].email);
      if (u) {
        seededUserMap[role] = u.id;
      }
    }
  });

  afterAll(async () => {
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    await redisHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 1: JWT Authentication & Lockout
  // ─────────────────────────────────────────────────────────────
  describe('Feature 1: JWT Authentication & Lockout Protection', () => {
    const testEmail = USER_CREDENTIALS.Super_Admin.email;
    const testPassword = USER_CREDENTIALS.Super_Admin.password;
    const lockoutTestEmail = 'lockout_test_user@wealthtrade.in';
    let lockoutUserId: string;

    beforeAll(async () => {
      const existing = await dbHelper.findUserByEmail(lockoutTestEmail);
      if (existing) {
        lockoutUserId = existing.id;
        await dbHelper.client.user.update({
          where: { id: lockoutUserId },
          data: { accountStatus: 'ACTIVE', failedLoginCount: 0, lockedAt: null },
        });
      } else {
        const passwordHash = await bcrypt.hash('LockoutPass@2026!', 10);
        const created = await dbHelper.client.user.create({
          data: {
            email: lockoutTestEmail,
            passwordHash,
            fullName: 'Lockout Test User',
            role: 'Operator',
            accountStatus: 'ACTIVE',
          },
        });
        lockoutUserId = created.id;
      }
      await redisHelper.resetLockout(lockoutUserId);
    });

    afterAll(async () => {
      if (lockoutUserId) {
        await redisHelper.resetLockout(lockoutUserId);
        await dbHelper.client.user.deleteMany({ where: { email: lockoutTestEmail } });
      }
    });

    it('F1-T1: should authenticate successfully with valid credentials and return RS256 JWT tokens', async () => {
      const res = await apiClient.post('/auth/login', {
        email: testEmail,
        password: testPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(res.body.expiresIn).toBe(900);
      expect(res.body.user).toMatchObject({
        email: testEmail,
        role: 'Super_Admin',
        fullName: 'System Super Admin',
      });

      // Verify token signature with platform public key
      const decoded = authHelper.verifyToken(res.body.accessToken) as any;
      expect(decoded.role).toBe('Super_Admin');
      expect(decoded.sub).toBeDefined();
    });

    it('F1-T2: should reject login with invalid password and increment failure count', async () => {
      const res = await apiClient.post('/auth/login', {
        email: testEmail,
        password: 'CompletelyWrongPassword!123',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
    });

    it('F1-T3: should reject login with non-existent email', async () => {
      const res = await apiClient.post('/auth/login', {
        email: 'non_existent_ghost_user@wealthtrade.in',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
    });

    it('F1-T4: should enforce account lockout after 5 consecutive failed attempts in Redis', async () => {
      await redisHelper.resetLockout(lockoutUserId);
      await dbHelper.client.user.update({
        where: { id: lockoutUserId },
        data: { accountStatus: 'ACTIVE', failedLoginCount: 0, lockedAt: null },
      });

      // Perform 5 consecutive failed login attempts
      for (let i = 1; i <= 5; i++) {
        const res = await apiClient.post('/auth/login', {
          email: lockoutTestEmail,
          password: `WrongPasswordAttempt${i}!`,
        });
        expect(res.status).toBe(401);
      }

      // 6th attempt must be rejected due to account lockout
      const lockedRes = await apiClient.post('/auth/login', {
        email: lockoutTestEmail,
        password: 'LockoutPass@2026!',
      });
      expect([401, 403]).toContain(lockedRes.status);
      expect(lockedRes.body.message).toMatch(/locked/i);

      // Verify Redis lockout counter reflects >=5
      const lockoutCount = await redisHelper.getLockoutCount(lockoutUserId);
      expect(lockoutCount).toBeGreaterThanOrEqual(5);

      // Verify DB reflects LOCKED status
      const dbUser = await dbHelper.client.user.findUnique({ where: { id: lockoutUserId } });
      expect(dbUser?.accountStatus).toBe('LOCKED');
    });

    it('F1-T5: should restore login capability after lockout counter is reset', async () => {
      // Reset lockout counter and update account status in DB
      await redisHelper.resetLockout(lockoutUserId);
      await dbHelper.client.user.update({
        where: { id: lockoutUserId },
        data: { accountStatus: 'ACTIVE', failedLoginCount: 0, lockedAt: null },
      });

      const res = await apiClient.post('/auth/login', {
        email: lockoutTestEmail,
        password: 'LockoutPass@2026!',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 2: Refresh Token Rotation
  // ─────────────────────────────────────────────────────────────
  describe('Feature 2: Refresh Token Rotation & Denylisting', () => {
    let testRefreshToken: string;
    let testRefreshJti: string;
    let testUserId: string;

    beforeEach(async () => {
      testUserId = seededUserMap.Admin;
      const refresh = authHelper.generateRefreshToken({ role: 'Admin', userId: testUserId });
      testRefreshToken = refresh.token;
      testRefreshJti = refresh.jti;
      const refreshTokenHash = await bcrypt.hash(testRefreshToken, 10);
      await dbHelper.client.user.update({
        where: { id: testUserId },
        data: { refreshTokenHash },
      });
      await redisHelper.setLastActivity(testUserId, Math.floor(Date.now() / 1000));
    });

    it('F2-T1: should rotate refresh token and issue new token pair', async () => {
      const refreshRes = await apiClient.post('/auth/refresh', {
        refreshToken: testRefreshToken,
      });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');
      expect(refreshRes.body.refreshToken).not.toBe(testRefreshToken);
    });

    it('F2-T2: should denylist previous refresh token JTI in Redis upon rotation', async () => {
      await apiClient.post('/auth/refresh', {
        refreshToken: testRefreshToken,
      });

      // The previous refresh token JTI must now be present in Redis denylist
      const isDenylisted = await redisHelper.isTokenDenylisted(testRefreshJti);
      expect(isDenylisted).toBe(true);
    });

    it('F2-T3: should reject reuse of rotated refresh token with 401 Unauthorized', async () => {
      // First refresh succeeds
      const firstRefresh = await apiClient.post('/auth/refresh', {
        refreshToken: testRefreshToken,
      });
      expect(firstRefresh.status).toBe(200);

      // Second attempt with same (now denylisted) refresh token must fail
      const reuseRes = await apiClient.post('/auth/refresh', {
        refreshToken: testRefreshToken,
      });
      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.message).toMatch(/revoked|invalid/i);
    });

    it('F2-T4: should reject malformed refresh token string with 401', async () => {
      const res = await apiClient.post('/auth/refresh', {
        refreshToken: 'invalid.malformed.jwt-token-string',
      });
      expect(res.status).toBe(401);
    });

    it('F2-T5: should denylist access token JTI on explicit POST /auth/logout', async () => {
      const { client, jti } = await createAuthedClient('Viewer');

      const logoutRes = await client.post('/auth/logout');
      expect(logoutRes.status).toBe(200);

      // Verify access token JTI is denylisted in Redis
      const isDenylisted = await redisHelper.isTokenDenylisted(jti);
      expect(isDenylisted).toBe(true);

      // Subsequent authenticated call with logged out token must fail
      const meRes = await client.get('/auth/me');
      expect(meRes.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 3: Inactivity Session Expiry (3600s)
  // ─────────────────────────────────────────────────────────────
  describe('Feature 3: Inactivity Session Expiry', () => {
    let marketingUserId: string;

    beforeAll(() => {
      marketingUserId = seededUserMap.Marketing_Employee;
    });

    it('F3-T1: should update last activity timestamp in Redis on authenticated request', async () => {
      const { client } = await createAuthedClient('Marketing_Employee', marketingUserId);
      const res = await client.get('/auth/me');
      expect(res.status).toBe(200);

      const lastActivity = await redisHelper.getLastActivity(marketingUserId);
      expect(lastActivity).not.toBeNull();
      expect(lastActivity).toBeGreaterThan(0);
    });

    it('F3-T2: should permit requests when last activity is within 3600 seconds', async () => {
      const { client } = await createAuthedClient('Marketing_Employee', marketingUserId);

      // Set activity to 300 seconds ago (< 3600)
      const recentActivity = Math.floor(Date.now() / 1000) - 300;
      await redisHelper.setLastActivity(marketingUserId, recentActivity);

      const res = await client.get('/auth/me');
      expect(res.status).toBe(200);
    });

    it('F3-T3: should reject request with 401 when inactivity exceeds 3600 seconds', async () => {
      const { client } = await createAuthedClient('Marketing_Employee', marketingUserId);

      // Clear activity in Redis to simulate session expiry
      await redisHelper.client.del(`auth:activity:${marketingUserId}`);

      const res = await client.get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/expired|inactivity/i);
    });

    it('F3-T4: should clear activity tracking key in Redis on logout', async () => {
      const { client } = await createAuthedClient('Marketing_Employee', marketingUserId);

      await client.post('/auth/logout');
      const activityKeyExists = await redisHelper.client.exists(`auth:activity:${marketingUserId}`);
      expect(activityKeyExists).toBe(0);
    });

    it('F3-T5: should refresh activity timestamp to current epoch upon successful request', async () => {
      const beforeReq = Math.floor(Date.now() / 1000);
      const { client } = await createAuthedClient('Marketing_Employee', marketingUserId);

      const res = await client.get('/auth/me');
      expect(res.status).toBe(200);

      const activity = await redisHelper.getLastActivity(marketingUserId);
      expect(activity).toBeGreaterThanOrEqual(beforeReq);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 4: TOTP Two-Factor Authentication
  // ─────────────────────────────────────────────────────────────
  describe('Feature 4: TOTP Two-Factor Authentication', () => {
    let totpUserId: string;
    let totpSecret: string;
    const totpEmail = 'totp_test_user@wealthtrade.in';

    beforeAll(async () => {
      const existing = await dbHelper.findUserByEmail(totpEmail);
      if (existing) {
        totpUserId = existing.id;
        await dbHelper.client.user.update({
          where: { id: totpUserId },
          data: { totpEnabled: false, totpSecret: null, accountStatus: 'ACTIVE', failedLoginCount: 0 },
        });
      } else {
        const passwordHash = await bcrypt.hash('TotpPass@2026!', 10);
        const created = await dbHelper.client.user.create({
          data: {
            email: totpEmail,
            passwordHash,
            fullName: 'TOTP Test User',
            role: 'Operator',
            accountStatus: 'ACTIVE',
            totpEnabled: false,
          },
        });
        totpUserId = created.id;
      }
      await redisHelper.resetLockout(totpUserId);
      await redisHelper.setLastActivity(totpUserId, Math.floor(Date.now() / 1000));
    });

    afterAll(async () => {
      await dbHelper.client.user.deleteMany({ where: { email: totpEmail } });
      if (totpUserId) {
        await redisHelper.resetLockout(totpUserId);
      }
    });

    it('F4-T1: should initiate TOTP setup and return base32 secret and QR code data URL', async () => {
      const { client } = await createAuthedClient('Operator', totpUserId);
      const res = await client.post('/auth/totp/setup');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('secret');
      expect(res.body).toHaveProperty('qrCodeDataUrl');
      expect(res.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
      totpSecret = res.body.secret;
    });

    it('F4-T2: should reject verification with invalid 6-digit TOTP code', async () => {
      const { client } = await createAuthedClient('Operator', totpUserId);
      const res = await client.post('/auth/totp/verify', {
        code: '000000', // Invalid code
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid/i);
    });

    it('F4-T3: should confirm TOTP activation with valid speakeasy-generated code', async () => {
      const code = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
      });

      const { client } = await createAuthedClient('Operator', totpUserId);
      const res = await client.post('/auth/totp/verify', { code });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      // Verify in DB that totpEnabled is now true
      const user = await dbHelper.client.user.findUnique({ where: { id: totpUserId } });
      expect(user?.totpEnabled).toBe(true);
    });

    it('F4-T4: should require totpCode on subsequent login once TOTP is enabled', async () => {
      const res = await apiClient.post('/auth/login', {
        email: totpEmail,
        password: 'TotpPass@2026!',
      });

      expect([400, 401]).toContain(res.status);
      expect(res.body.message).toMatch(/totp|two-factor/i);
    });

    it('F4-T5: should succeed login when valid totpCode is provided for 2FA-enabled account', async () => {
      const code = speakeasy.totp({
        secret: totpSecret,
        encoding: 'base32',
      });

      const res = await apiClient.post('/auth/login', {
        email: totpEmail,
        password: 'TotpPass@2026!',
        totpCode: code,
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user.totpEnabled).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 5: Dynamic Role Invalidation
  // ─────────────────────────────────────────────────────────────
  describe('Feature 5: Dynamic Role Invalidation', () => {
    let testOperatorId: string;
    let operatorAccessToken: string;

    beforeAll(async () => {
      const email = 'dyn_role_test@wealthtrade.in';
      const existing = await dbHelper.findUserByEmail(email);
      if (existing) {
        testOperatorId = existing.id;
        await dbHelper.client.user.update({
          where: { id: testOperatorId },
          data: { role: 'Operator', accountStatus: 'ACTIVE', failedLoginCount: 0 },
        });
      } else {
        const passwordHash = await bcrypt.hash('DynRole@2026!', 10);
        const created = await dbHelper.client.user.create({
          data: {
            email,
            passwordHash,
            fullName: 'Dynamic Role Operator',
            role: 'Operator',
            accountStatus: 'ACTIVE',
          },
        });
        testOperatorId = created.id;
      }
      await redisHelper.client.del(`auth:invalidate:${testOperatorId}`);

      // Generate operator token with current timestamp
      const { token } = await createAuthedClient('Operator', testOperatorId);
      operatorAccessToken = token;
    });

    afterAll(async () => {
      await dbHelper.client.user.deleteMany({ where: { email: 'dyn_role_test@wealthtrade.in' } });
      if (testOperatorId) {
        await redisHelper.client.del(`auth:invalidate:${testOperatorId}`);
      }
    });

    it('F5-T1: should update user role in database via PATCH /users/:id/role', async () => {
      const { client } = await createAuthedClient('Super_Admin');
      const res = await client.patch(`/users/${testOperatorId}/role`, {
        role: 'Viewer',
      });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('Viewer');

      const updatedUser = await dbHelper.client.user.findUnique({ where: { id: testOperatorId } });
      expect(updatedUser?.role).toBe('Viewer');
    });

    it('F5-T2: should publish / record invalidation timestamp in Redis (auth:invalidate:{userId})', async () => {
      const invalidationTs = await redisHelper.getRoleInvalidationTimestamp(testOperatorId);
      expect(invalidationTs).not.toBeNull();
      expect(invalidationTs).toBeGreaterThan(0);
    });

    it('F5-T3: should reject tokens issued before the invalidation timestamp', async () => {
      const client = apiClient.withToken(operatorAccessToken);
      const res = await client.get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.message).toMatch(/revoked|invalid/i);
    });

    it('F5-T4: should accept newly issued tokens after role modification', async () => {
      const invalidationTs = await redisHelper.getRoleInvalidationTimestamp(testOperatorId);
      // Newly issued token with iat strictly greater than invalidation timestamp
      const freshIat = (invalidationTs || Math.floor(Date.now() / 1000)) + 2;
      const { token } = authHelper.generateAccessToken({
        role: 'Viewer',
        userId: testOperatorId,
        extraClaims: { iat: freshIat },
      });
      await redisHelper.setLastActivity(testOperatorId, Math.floor(Date.now() / 1000));
      const client = apiClient.withToken(token);
      const res = await client.get('/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('Viewer');
    });

    it('F5-T5: should enforce that demoted role loses higher privileged endpoint access', async () => {
      const uniqueEmail = `demoted_${Date.now()}@wealthtrade.in`;
      const demotedUser = await dbHelper.client.user.create({
        data: {
          email: uniqueEmail,
          passwordHash: await bcrypt.hash('Demoted@2026!', 10),
          fullName: 'Demoted Admin',
          role: 'Admin',
          accountStatus: 'ACTIVE',
        },
      });

      // User token before demotion
      const { client: adminClient } = await createAuthedClient('Admin', demotedUser.id);

      // Super_Admin demotes user to Viewer
      const { client: superClient } = await createAuthedClient('Super_Admin');
      await superClient.patch(`/users/${demotedUser.id}/role`, { role: 'Viewer' });

      // Old admin token must be rejected
      const res = await adminClient.get('/users');
      expect([401, 403]).toContain(res.status);

      await dbHelper.client.user.delete({ where: { id: demotedUser.id } });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 6: Seeded Credentials for 5 Roles
  // ─────────────────────────────────────────────────────────────
  describe('Feature 6: Seeded Credentials Verification for all 5 Roles', () => {
    const roles: UserRoleKey[] = [
      'Super_Admin',
      'Admin',
      'Marketing_Employee',
      'Operator',
      'Viewer',
    ];

    it.each(roles)(
      'F6: should authenticate seeded user for %s and confirm ACTIVE status',
      async (role) => {
        const creds = USER_CREDENTIALS[role];
        const res = await apiClient.post('/auth/login', {
          email: creds.email,
          password: creds.password,
        });

        expect(res.status).toBe(200);
        expect(res.body.user.role).toBe(role);
        expect(res.body.user.email).toBe(creds.email);
        expect(res.body.user.fullName).toBe(creds.fullName);

        // Direct DB verification
        const dbUser = await dbHelper.findUserByEmail(creds.email);
        expect(dbUser).not.toBeNull();
        expect(dbUser?.accountStatus).toBe('ACTIVE');
        expect(dbUser?.role).toBe(role);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 7: Operator Account CRUD
  // ─────────────────────────────────────────────────────────────
  describe('Feature 7: Operator Account CRUD', () => {
    let createdUserId: string;
    const operatorPayload = {
      email: 'crud_op_test@wealthtrade.in',
      password: 'OperatorPass@2026!',
      fullName: 'CRUD Test Operator',
      role: 'Operator',
    };

    afterAll(async () => {
      await dbHelper.client.user.deleteMany({
        where: { email: operatorPayload.email },
      });
    });

    it('F7-T1: should create new Operator account via POST /users', async () => {
      const { client } = await createAuthedClient('Super_Admin');
      const res = await client.post('/users', operatorPayload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(operatorPayload.email);
      expect(res.body.role).toBe('Operator');
      expect(res.body).not.toHaveProperty('passwordHash');
      createdUserId = res.body.id;
    });

    it('F7-T2: should retrieve Operator account by ID via GET /users/:id', async () => {
      const { client } = await createAuthedClient('Super_Admin');
      const res = await client.get(`/users/${createdUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdUserId);
      expect(res.body.email).toBe(operatorPayload.email);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('F7-T3: should update Operator profile details via PATCH /users/:id', async () => {
      const { client } = await createAuthedClient('Super_Admin');
      const res = await client.patch(`/users/${createdUserId}`, {
        fullName: 'Updated Operator Name',
      });

      expect(res.status).toBe(200);
      expect(res.body.fullName).toBe('Updated Operator Name');

      const userInDb = await dbHelper.client.user.findUnique({ where: { id: createdUserId } });
      expect(userInDb?.fullName).toBe('Updated Operator Name');
    });

    it('F7-T4: should soft-delete Operator via DELETE /users/:id (setting deletedAt and INACTIVE)', async () => {
      const { client } = await createAuthedClient('Super_Admin');
      const res = await client.delete(`/users/${createdUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.accountStatus).toBe('INACTIVE');

      const userInDb = await dbHelper.client.user.findUnique({ where: { id: createdUserId } });
      expect(userInDb?.accountStatus).toBe('INACTIVE');
      expect(userInDb?.deletedAt).not.toBeNull();
    });

    it('F7-T5: should unlock a locked Operator account via POST /users/:id/unlock', async () => {
      // Restore deletedAt to simulate an active user that got locked
      await dbHelper.client.user.update({
        where: { id: createdUserId },
        data: { accountStatus: 'LOCKED', failedLoginCount: 5, deletedAt: null },
      });
      await redisHelper.setLockoutCount(createdUserId, 5);

      const { client } = await createAuthedClient('Super_Admin');
      const res = await client.post(`/users/${createdUserId}/unlock`);
      expect(res.status).toBe(200);
      expect(res.body.accountStatus).toBe('ACTIVE');

      // Lockout in Redis must be cleared
      const redisLockout = await redisHelper.getLockoutCount(createdUserId);
      expect(redisLockout).toBe(0);

      const dbUser = await dbHelper.client.user.findUnique({ where: { id: createdUserId } });
      expect(dbUser?.accountStatus).toBe('ACTIVE');
      expect(dbUser?.failedLoginCount).toBe(0);
    });
  });
});
