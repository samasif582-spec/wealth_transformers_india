import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

const ROLE_HIERARCHY: Record<string, number> = {
  Admin: 1,
  Super_Admin: 2,
};

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { role: string } }>();
    const userRole = request.user?.role;

    if (!userRole) {
      throw new ForbiddenException('No role assigned');
    }

    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const hasRole = requiredRoles.some(
      (required) => userLevel >= (ROLE_HIERARCHY[required as string] ?? 999),
    );

    if (!hasRole) {
      this.logger.warn(`Access denied: user role ${userRole} insufficient for ${requiredRoles.join(', ')}`);
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
