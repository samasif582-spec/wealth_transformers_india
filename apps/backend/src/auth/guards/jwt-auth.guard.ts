import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable, firstValueFrom } from 'rxjs';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { RedisService } from '../../redis/redis.service';
import { SESSION_INACTIVITY_MAX_SECONDS } from '../auth.constants';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly guardLogger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    let result = super.canActivate(context);
    if (result instanceof Observable) {
      result = await firstValueFrom(result);
    } else {
      result = await result;
    }

    if (!result) {
      return false;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    if (!user || !user.sub) {
      throw new UnauthorizedException('Authentication required');
    }

    // 1. Check Redis token denylist
    if (user.jti) {
      const isDenylisted = await this.redis.isTokenDenylisted(user.jti);
      if (isDenylisted) {
        this.guardLogger.warn(`Token with jti ${user.jti} is denylisted`);
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    // 2. Check dynamic role invalidation / revocation
    if (user.iat) {
      const isRevoked = await this.redis.isTokenRevokedByRoleChange(
        user.sub,
        user.iat,
      );
      if (isRevoked) {
        this.guardLogger.warn(
          `User ${user.sub} token revoked due to role change`,
        );
        throw new UnauthorizedException('Token revoked due to role change');
      }
    }

    // 3. Check inactivity session expiry
    const isExpired = await this.redis.isSessionExpired(
      user.sub,
      SESSION_INACTIVITY_MAX_SECONDS,
    );
    if (isExpired) {
      this.guardLogger.warn(`User ${user.sub} session expired due to inactivity`);
      throw new UnauthorizedException('Session expired due to inactivity');
    }

    // 4. Update activity timestamp in Redis
    await this.redis.setActivity(user.sub, SESSION_INACTIVITY_MAX_SECONDS);

    return true;
  }

  handleRequest<T>(err: Error | null, user: T): T {
    if (err ?? !user) {
      throw err ?? new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
