import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let redis: any;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    redis = {
      isTokenDenylisted: jest.fn().mockResolvedValue(false),
      isTokenRevokedByRoleChange: jest.fn().mockResolvedValue(false),
      isSessionExpired: jest.fn().mockResolvedValue(false),
      setActivity: jest.fn().mockResolvedValue(undefined),
    };

    guard = new JwtAuthGuard(reflector, redis);

    mockRequest = {
      user: {
        sub: 'user-123',
        role: 'Admin',
        jti: 'jti-valid',
        iat: Math.floor(Date.now() / 1000) - 100,
      },
    };

    mockContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as any;

    // Mock AuthGuard('jwt') passport super.canActivate
    jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockImplementation(function (this: any) {
        return true;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should allow public routes without authentication', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(redis.isTokenDenylisted).not.toHaveBeenCalled();
  });

  it('should allow authenticated requests when token is valid and active', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
    expect(redis.isTokenDenylisted).toHaveBeenCalledWith('jti-valid');
    expect(redis.isTokenRevokedByRoleChange).toHaveBeenCalledWith('user-123', mockRequest.user.iat);
    expect(redis.isSessionExpired).toHaveBeenCalledWith('user-123', 3600);
    expect(redis.setActivity).toHaveBeenCalledWith('user-123', 3600);
  });

  it('should reject request when token JTI is denylisted in Redis', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    redis.isTokenDenylisted.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      new UnauthorizedException('Token has been revoked'),
    );
  });

  it('should reject request when token is revoked due to role change', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    redis.isTokenRevokedByRoleChange.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      new UnauthorizedException('Token revoked due to role change'),
    );
  });

  it('should reject request when session has expired due to 60m inactivity', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    redis.isSessionExpired.mockResolvedValue(true);

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      new UnauthorizedException('Session expired due to inactivity'),
    );
  });
});
