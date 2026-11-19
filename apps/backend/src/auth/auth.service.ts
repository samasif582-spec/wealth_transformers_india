import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserRole, AccountStatus, AuditActionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import {
  BCRYPT_SALT_ROUNDS,
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_TTL_SECONDS,
  SESSION_INACTIVITY_MAX_SECONDS,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;
  role: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface SanitizedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  accountStatus: AccountStatus;
  totpEnabled: boolean;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    role: UserRole;
    fullName: string;
    totpEnabled: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  issueTokenPair(userId: string, role: string): TokenPair {
    const accessTtl = Number(
      this.config.get<number>('JWT_ACCESS_TOKEN_TTL', 900),
    );
    const refreshTtl = Number(
      this.config.get<number>('JWT_REFRESH_TOKEN_TTL', 604800),
    );

    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessToken = this.jwtService.sign(
      { sub: userId, role, jti: accessJti },
      { expiresIn: accessTtl },
    );

    const refreshToken = this.jwtService.sign(
      { sub: userId, role, jti: refreshJti },
      { expiresIn: refreshTtl },
    );

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  async login(loginDto: LoginDto, ipAddress?: string): Promise<LoginResponse> {
    const email = loginDto.email.toLowerCase().trim();
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      this.logger.warn(`Failed login attempt for non-existent user: ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.accountStatus === AccountStatus.LOCKED) {
      this.logger.warn(`Login attempted on locked account: ${user.id}`);
      throw new UnauthorizedException(
        'Account is locked due to consecutive failed attempts. Please contact an administrator.',
      );
    }

    if (user.accountStatus === AccountStatus.INACTIVE) {
      this.logger.warn(`Login attempted on inactive account: ${user.id}`);
      throw new UnauthorizedException('Account is inactive.');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      const attempts = await this.redis.incrementLockout(
        user.id,
        LOCKOUT_TTL_SECONDS,
      );
      this.logger.warn(
        `Failed password for user ${user.id}, attempt ${attempts}/${LOCKOUT_MAX_ATTEMPTS}`,
      );

      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: attempts },
      });

      if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            accountStatus: AccountStatus.LOCKED,
            lockedAt: new Date(),
          },
        });

        await this.prisma.auditLog.create({
          data: {
            actorId: user.id,
            actorRole: user.role,
            actionType: AuditActionType.UPDATE,
            resourceType: 'User',
            resourceId: user.id,
            ipAddress: ipAddress ?? '127.0.0.1',
            beforeState: { accountStatus: user.accountStatus },
            afterState: { accountStatus: AccountStatus.LOCKED },
            metadata: {
              reason: 'Locked after 5 consecutive failed login attempts',
              failedAttempts: attempts,
            },
          },
        });

        throw new UnauthorizedException(
          'Account has been locked due to 5 consecutive failed login attempts.',
        );
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    // Password valid; verify TOTP if enabled
    if (user.totpEnabled) {
      if (!loginDto.totpCode) {
        throw new UnauthorizedException('TOTP code is required');
      }

      const isTotpValid = speakeasy.totp.verify({
        secret: user.totpSecret!,
        encoding: 'base32',
        token: loginDto.totpCode,
        window: 1,
      });

      if (!isTotpValid) {
        const attempts = await this.redis.incrementLockout(
          user.id,
          LOCKOUT_TTL_SECONDS,
        );
        this.logger.warn(
          `Failed TOTP code for user ${user.id}, attempt ${attempts}/${LOCKOUT_MAX_ATTEMPTS}`,
        );

        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: attempts },
        });

        if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              accountStatus: AccountStatus.LOCKED,
              lockedAt: new Date(),
            },
          });

          await this.prisma.auditLog.create({
            data: {
              actorId: user.id,
              actorRole: user.role,
              actionType: AuditActionType.UPDATE,
              resourceType: 'User',
              resourceId: user.id,
              ipAddress: ipAddress ?? '127.0.0.1',
              beforeState: { accountStatus: user.accountStatus },
              afterState: { accountStatus: AccountStatus.LOCKED },
              metadata: {
                reason: 'Locked after 5 consecutive failed login attempts (MFA)',
                failedAttempts: attempts,
              },
            },
          });

          throw new UnauthorizedException(
            'Account has been locked due to 5 consecutive failed login attempts.',
          );
        }

        throw new UnauthorizedException('Invalid TOTP verification code');
      }
    }

    // Success: clear lockout counter and reset failedLoginCount
    await this.redis.clearLockout(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lastActivityAt: new Date(),
      },
    });

    const tokens = this.issueTokenPair(user.id, user.role);

    // Hash refresh token into DB for rotation detection
    const refreshTokenHash = await bcrypt.hash(
      tokens.refreshToken,
      BCRYPT_SALT_ROUNDS,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash },
    });

    // Record activity timestamp in Redis (60m rolling session window)
    await this.redis.setActivity(user.id, SESSION_INACTIVITY_MAX_SECONDS);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        totpEnabled: user.totpEnabled,
      },
    };
  }

  async refresh(refreshTokenStr: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.verifyToken(refreshTokenStr);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check if refresh token's JTI is in Redis denylist
    const isDenylisted = await this.redis.isTokenDenylisted(payload.jti);
    if (isDenylisted) {
      this.logger.warn(`Attempted use of denylisted refresh token ${payload.jti}`);
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });

    if (
      !user ||
      user.accountStatus !== AccountStatus.ACTIVE ||
      !user.refreshTokenHash
    ) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    // Verify token hash match
    const isMatch = await bcrypt.compare(
      refreshTokenStr,
      user.refreshTokenHash,
    );
    if (!isMatch) {
      // Possible reuse attack! Denylist the presented token immediately
      const accessTtl = Number(
        this.config.get<number>('JWT_REFRESH_TOKEN_TTL', 604800),
      );
      await this.redis.denylistToken(payload.jti, accessTtl);
      this.logger.error(`Refresh token hash mismatch for user ${user.id}`);
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Denylist the old refresh token JTI in Redis
    const nowSec = Math.floor(Date.now() / 1000);
    const remainingTtl = payload.exp ? Math.max(1, payload.exp - nowSec) : 604800;
    await this.redis.denylistToken(payload.jti, remainingTtl);

    // Issue rotated token pair
    const newTokens = this.issueTokenPair(user.id, user.role);

    // Hash and store new refresh token in DB
    const newHash = await bcrypt.hash(
      newTokens.refreshToken,
      BCRYPT_SALT_ROUNDS,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: newHash,
        lastActivityAt: new Date(),
      },
    });

    // Refresh activity in Redis
    await this.redis.setActivity(user.id, SESSION_INACTIVITY_MAX_SECONDS);

    return newTokens;
  }

  async logout(
    userId: string,
    accessJti?: string,
    refreshTokenStr?: string,
  ): Promise<{ success: boolean }> {
    if (accessJti) {
      const accessTtl = Number(
        this.config.get<number>('JWT_ACCESS_TOKEN_TTL', 900),
      );
      await this.redis.denylistToken(accessJti, accessTtl);
    }

    if (refreshTokenStr) {
      try {
        const payload = this.verifyToken(refreshTokenStr);
        const nowSec = Math.floor(Date.now() / 1000);
        const remainingTtl = payload.exp
          ? Math.max(1, payload.exp - nowSec)
          : 604800;
        await this.redis.denylistToken(payload.jti, remainingTtl);
      } catch {
        // Token was invalid/expired, ignore error
      }
    }

    // Invalidate refresh token in DB and clear activity key in Redis
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    await this.redis.clearActivity(userId);

    return { success: true };
  }

  async getMe(userId: string): Promise<SanitizedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        accountStatus: true,
        totpEnabled: true,
        lastActivityAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async setupTotp(userId: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `WealthTrade (${user.email})`,
      issuer: 'WealthTrade WhatsApp Platform',
      length: 20,
    });

    const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url!);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret.base32 },
    });

    return {
      secret: secret.base32,
      qrCodeDataUrl,
    };
  }

  async verifyTotp(
    userId: string,
    code: string,
  ): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user || !user.totpSecret) {
      throw new BadRequestException('TOTP setup has not been initiated');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid TOTP verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    return { success: true };
  }
}
