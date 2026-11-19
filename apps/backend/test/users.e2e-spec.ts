import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, AccountStatus, AuditActionType } from '@prisma/client';

describe('UsersModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let viewerToken: string;
  let createdUserId: string;

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

    // Login as Super_Admin
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'superadmin@wealthtrade.in',
        password: 'SuperAdmin@2026!',
      })
      .expect(200);

    adminToken = adminLogin.body.accessToken;

    // Login as Viewer
    const viewerLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'viewer@wealthtrade.in',
        password: 'Viewer@2026!',
      })
      .expect(200);

    viewerToken = viewerLogin.body.accessToken;
  });

  afterAll(async () => {
    // Clean up created user if exists
    if (createdUserId) {
      await prisma.auditLog.deleteMany({
        where: { resourceId: createdUserId },
      });
      await prisma.user.deleteMany({
        where: { id: createdUserId },
      });
    }
    await app.close();
  });

  describe('POST /api/v1/users', () => {
    it('should allow Super_Admin to create a new user', async () => {
      const email = `newop_${Date.now()}@wealthtrade.in`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email,
          fullName: 'New Operations Lead',
          password: 'Password@2026!',
          role: UserRole.Operator,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(email);
      expect(res.body.role).toBe(UserRole.Operator);
      expect(res.body).not.toHaveProperty('passwordHash');

      createdUserId = res.body.id;
    });

    it('should deny Viewer from creating a user with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          email: 'unauthorized@wealthtrade.in',
          fullName: 'Unauthorized User',
          password: 'Password@2026!',
          role: UserRole.Operator,
        })
        .expect(403);
    });
  });

  describe('GET /api/v1/users', () => {
    it('should return paginated users for Admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page', 1);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should find user by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(createdUserId);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('should update user profile details', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ fullName: 'Updated Operations Lead' })
        .expect(200);

      expect(res.body.fullName).toBe('Updated Operations Lead');
    });
  });

  describe('POST /api/v1/users/:id/unlock', () => {
    it('should unlock a locked user', async () => {
      // First lock the user in DB
      await prisma.user.update({
        where: { id: createdUserId },
        data: {
          accountStatus: AccountStatus.LOCKED,
          lockedAt: new Date(),
          failedLoginCount: 5,
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/users/${createdUserId}/unlock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.accountStatus).toBe(AccountStatus.ACTIVE);
      expect(res.body.lockedAt).toBeNull();
      expect(res.body.failedLoginCount).toBe(0);
    });
  });

  describe('PATCH /api/v1/users/:id/role', () => {
    it('should update user role and create an audit log entry', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${createdUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: UserRole.Marketing_Employee })
        .expect(200);

      expect(res.body.role).toBe(UserRole.Marketing_Employee);

      // Verify AuditLog entry was recorded
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          resourceId: createdUserId,
          actionType: AuditActionType.ROLE_CHANGE,
        },
      });

      expect(auditLog).not.toBeNull();
      expect((auditLog?.afterState as any)?.role).toBe(UserRole.Marketing_Employee);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('should soft delete user and exclude from user listings', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${createdUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.accountStatus).toBe(AccountStatus.INACTIVE);
      expect(res.body.deletedAt).not.toBeNull();

      // Verify the user is strictly excluded from GET /users
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const found = listRes.body.data.find((u: any) => u.id === createdUserId);
      expect(found).toBeUndefined();
    });
  });
});
