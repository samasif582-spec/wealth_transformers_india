import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { UserRole, AccountStatus, AuditActionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let redis: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'operator@wealthtrade.in',
    fullName: 'Test Operator',
    role: UserRole.Operator,
    accountStatus: AccountStatus.ACTIVE,
    failedLoginCount: 0,
    lockedAt: null,
    lastActivityAt: null,
    totpEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    redis = {
      clearLockout: jest.fn().mockResolvedValue(undefined),
      invalidateUserTokens: jest.fn().mockResolvedValue(undefined),
      clearActivity: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create user with bcrypt cost factor 12 password hash', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUser);

      const dto = {
        email: 'newuser@wealthtrade.in',
        fullName: 'New User',
        password: 'Password@123',
        role: UserRole.Operator,
      };

      const result = await service.create(dto, 'admin-id', UserRole.Admin);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newuser@wealthtrade.in',
            role: UserRole.Operator,
            passwordHash: expect.any(String),
          }),
        }),
      );

      // Verify bcrypt salt cost factor is 12 ($2b$12$...)
      const createdCall = prisma.user.create.mock.calls[0][0];
      expect(createdCall.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: AuditActionType.CREATE,
            actorId: 'admin-id',
          }),
        }),
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException on duplicate email', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.create({
          email: 'operator@wealthtrade.in',
          fullName: 'Duplicate',
          password: 'Password@123',
          role: UserRole.Operator,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users strictly excluding soft-deleted records', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
          skip: 0,
          take: 10,
        }),
      );
      expect(result).toEqual({
        data: [mockUser],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should apply role, status, and search filters', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([mockUser]);

      await service.findAll({
        role: UserRole.Operator,
        status: AccountStatus.ACTIVE,
        q: 'operator',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            role: UserRole.Operator,
            accountStatus: AccountStatus.ACTIVE,
            OR: [
              { email: { contains: 'operator', mode: 'insensitive' } },
              { fullName: { contains: 'operator', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return sanitized user when found', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.findById(mockUser.id);
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user does not exist or is soft-deleted', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('should mark deletedAt, set INACTIVE, invalidate Redis tokens, and audit log', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        accountStatus: AccountStatus.INACTIVE,
        deletedAt: new Date(),
      });

      const result = await service.softDelete(mockUser.id, 'admin-id', UserRole.Admin);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            accountStatus: AccountStatus.INACTIVE,
            deletedAt: expect.any(Date),
          }),
        }),
      );
      expect(redis.invalidateUserTokens).toHaveBeenCalledWith(mockUser.id);
      expect(redis.clearActivity).toHaveBeenCalledWith(mockUser.id);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionType: AuditActionType.DELETE,
            resourceId: mockUser.id,
          }),
        }),
      );
      expect(result.accountStatus).toBe(AccountStatus.INACTIVE);
    });
  });

  describe('unlock', () => {
    it('should set status ACTIVE, clear lockedAt and failedLoginCount, clear Redis lockout', async () => {
      const lockedUser = {
        ...mockUser,
        accountStatus: AccountStatus.LOCKED,
        lockedAt: new Date(),
        failedLoginCount: 5,
      };
      prisma.user.findFirst.mockResolvedValue(lockedUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.unlock(mockUser.id, 'admin-id', UserRole.Admin);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: {
            accountStatus: AccountStatus.ACTIVE,
            lockedAt: null,
            failedLoginCount: 0,
          },
        }),
      );
      expect(redis.clearLockout).toHaveBeenCalledWith(mockUser.id);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { action: 'ACCOUNT_UNLOCKED' },
          }),
        }),
      );
      expect(result.accountStatus).toBe(AccountStatus.ACTIVE);
    });
  });

  describe('updateRole', () => {
    it('should atomically update role, record AuditLog, and invalidate tokens in Redis', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.update.mockReturnValue(Promise.resolve({ ...mockUser, role: UserRole.Admin }));
      prisma.auditLog.create.mockReturnValue(Promise.resolve({ id: 'audit-role-change' }));

      const result = await service.updateRole(
        mockUser.id,
        UserRole.Admin,
        'admin-actor-id',
        UserRole.Super_Admin,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(redis.invalidateUserTokens).toHaveBeenCalledWith(mockUser.id);
      expect(result.role).toBe(UserRole.Admin);
    });

    it('should forbid operator from modifying their own role', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.updateRole(
          mockUser.id,
          UserRole.Super_Admin,
          mockUser.id, // self modification attempt
          mockUser.role,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
