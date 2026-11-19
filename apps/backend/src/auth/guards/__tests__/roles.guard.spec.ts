import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';
import { UserRole } from '@prisma/client';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    guard = new RolesGuard(reflector);
  });

  const createContextWithRole = (role?: string): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: role ? { role } : undefined,
        }),
      }),
    } as any;
  };

  it('should allow access if no roles are required on the endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    mockContext = createContextWithRole('Viewer');

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should allow Super_Admin to access Admin endpoint via hierarchy', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
    mockContext = createContextWithRole(UserRole.Super_Admin);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should allow Admin to access Admin endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
    mockContext = createContextWithRole(UserRole.Admin);

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('should deny Operator from accessing Admin endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Admin]);
    mockContext = createContextWithRole(UserRole.Operator);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('should deny Viewer from accessing Operator endpoint', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Operator]);
    mockContext = createContextWithRole(UserRole.Viewer);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user has no role assigned', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.Viewer]);
    mockContext = createContextWithRole(undefined);

    expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
  });
});
