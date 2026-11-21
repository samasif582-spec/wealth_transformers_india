import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  UserRole,
  AccountStatus,
  AuditActionType,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.constants';
import { SanitizedUser } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserFilterDto } from './dto/user-filter.dto';

export const SANITIZED_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  accountStatus: true,
  failedLoginCount: true,
  lockedAt: true,
  lastActivityAt: true,
  totpEnabled: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export interface PaginatedUsersResponse {
  data: SanitizedUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const userCount = await this.prisma.user.count();
      if (userCount === 0) {
        this.logger.log('🌱 No administrative accounts found. Initializing secure administrative accounts...');

        const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'superadmin@wealthtransformers.in').toLowerCase().trim();
        const superAdminPassword = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex') + '!Aa1';

        const adminEmail = (process.env.ADMIN_EMAIL || 'admin@wealthtransformers.in').toLowerCase().trim();
        const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex') + '!Aa1';

        const accounts = [
          {
            email: superAdminEmail,
            password: superAdminPassword,
            fullName: 'System Super Admin',
            role: UserRole.Super_Admin,
          },
          {
            email: adminEmail,
            password: adminPassword,
            fullName: 'Operations Admin',
            role: UserRole.Admin,
          },
        ];

        for (const u of accounts) {
          const passwordHash = await bcrypt.hash(u.password, BCRYPT_SALT_ROUNDS);
          await this.prisma.user.create({
            data: {
              email: u.email,
              fullName: u.fullName,
              passwordHash,
              role: u.role,
              accountStatus: AccountStatus.ACTIVE,
            },
          });

          if (!process.env.ADMIN_PASSWORD && !process.env.SUPERADMIN_PASSWORD) {
            this.logger.warn(`🔑 Secure bootstrap credential generated for [${u.email}] -> Password: ${u.password}`);
          }
        }
        this.logger.log('✅ Secure administrative accounts initialized successfully.');
      }
    } catch (err: any) {
      this.logger.warn(`Could not seed default users: ${err.message}`);
    }
  }

  async create(
    dto: CreateUserDto,
    actorId?: string,
    actorRole?: UserRole,
  ): Promise<SanitizedUser> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email address is already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        passwordHash,
        role: dto.role,
        accountStatus: AccountStatus.ACTIVE,
      },
      select: SANITIZED_USER_SELECT,
    });

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          actionType: AuditActionType.CREATE,
          resourceType: 'User',
          resourceId: user.id,
          afterState: {
            id: user.id,
            email: user.email,
            role: user.role,
            fullName: user.fullName,
          },
        },
      });
    }

    return user;
  }

  async findAll(filter: UserFilterDto): Promise<PaginatedUsersResponse> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
    };

    if (filter.role) {
      where.role = filter.role;
    }

    if (filter.status) {
      where.accountStatus = filter.status;
    }

    if (filter.q) {
      const query = filter.q.trim();
      where.OR = [
        { email: { contains: query, mode: 'insensitive' } },
        { fullName: { contains: query, mode: 'insensitive' } },
      ];
    }

    const page = filter.page && filter.page > 0 ? Number(filter.page) : 1;
    const limit = filter.limit && filter.limit > 0 ? Number(filter.limit) : 10;
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: SANITIZED_USER_SELECT,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<SanitizedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: SANITIZED_USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId?: string,
    actorRole?: UserRole,
  ): Promise<SanitizedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
      const email = dto.email.toLowerCase().trim();
      const existing = await this.prisma.user.findFirst({
        where: { email, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException('Email address is already in use');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName !== undefined ? dto.fullName.trim() : user.fullName,
        email: dto.email ? dto.email.toLowerCase().trim() : user.email,
        accountStatus: dto.accountStatus ?? user.accountStatus,
      },
      select: SANITIZED_USER_SELECT,
    });

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          actionType: AuditActionType.UPDATE,
          resourceType: 'User',
          resourceId: id,
          beforeState: {
            fullName: user.fullName,
            email: user.email,
            accountStatus: user.accountStatus,
          },
          afterState: {
            fullName: updated.fullName,
            email: updated.email,
            accountStatus: updated.accountStatus,
          },
        },
      });
    }

    return updated;
  }

  async softDelete(
    id: string,
    actorId?: string,
    actorRole?: UserRole,
  ): Promise<SanitizedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const deleted = await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        accountStatus: AccountStatus.INACTIVE,
        refreshTokenHash: null,
      },
      select: SANITIZED_USER_SELECT,
    });

    // Invalidate tokens immediately
    await this.redis.invalidateUserTokens(id);
    await this.redis.clearActivity(id);

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          actionType: AuditActionType.DELETE,
          resourceType: 'User',
          resourceId: id,
          beforeState: {
            accountStatus: user.accountStatus,
            deletedAt: user.deletedAt,
          },
          afterState: {
            accountStatus: AccountStatus.INACTIVE,
            deletedAt: deleted.deletedAt,
          },
        },
      });
    }

    return deleted;
  }

  async unlock(
    id: string,
    actorId?: string,
    actorRole?: UserRole,
  ): Promise<SanitizedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const unlocked = await this.prisma.user.update({
      where: { id },
      data: {
        accountStatus: AccountStatus.ACTIVE,
        lockedAt: null,
        failedLoginCount: 0,
      },
      select: SANITIZED_USER_SELECT,
    });

    // Clear Redis lockout key
    await this.redis.clearLockout(id);

    if (actorId) {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          actionType: AuditActionType.UPDATE,
          resourceType: 'User',
          resourceId: id,
          beforeState: {
            accountStatus: user.accountStatus,
            lockedAt: user.lockedAt,
            failedLoginCount: user.failedLoginCount,
          },
          afterState: {
            accountStatus: AccountStatus.ACTIVE,
            lockedAt: null,
            failedLoginCount: 0,
          },
          metadata: { action: 'ACCOUNT_UNLOCKED' },
        },
      });
    }

    return unlocked;
  }

  async updateRole(
    id: string,
    newRole: UserRole,
    actorId: string,
    actorRole?: UserRole,
  ): Promise<SanitizedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (id === actorId && newRole !== user.role) {
      throw new ForbiddenException('Cannot modify your own role');
    }

    // Atomic update of user role and audit log creation
    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { role: newRole },
        select: SANITIZED_USER_SELECT,
      }),
      this.prisma.auditLog.create({
        data: {
          actorId,
          actorRole,
          actionType: AuditActionType.ROLE_CHANGE,
          resourceType: 'User',
          resourceId: id,
          beforeState: { role: user.role },
          afterState: { role: newRole },
          metadata: { reason: 'Administrative role assignment' },
        },
      }),
    ]);

    // Invalidate user tokens in Redis and publish event
    await this.redis.invalidateUserTokens(id);

    return updatedUser;
  }
}
