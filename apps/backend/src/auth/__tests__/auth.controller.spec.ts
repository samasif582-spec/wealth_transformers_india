import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { UserRole } from '@prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;

  const mockUserPayload = {
    sub: 'user-1',
    role: UserRole.Admin,
    jti: 'access-jti-1',
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access.token',
        refreshToken: 'refresh.token',
        expiresIn: 900,
        user: { id: 'user-1', email: 'admin@wealthtrade.in', role: UserRole.Admin },
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new.access.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 900,
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
      getMe: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'admin@wealthtrade.in',
        role: UserRole.Admin,
      }),
      setupTotp: jest.fn().mockResolvedValue({
        secret: 'base32secret',
        qrCodeDataUrl: 'data:image/png;base64,...',
      }),
      verifyTotp: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call authService.login', async () => {
    const dto = { email: 'admin@wealthtrade.in', password: 'Password@123' };
    const req = { ip: '127.0.0.1' } as any;
    const res = await controller.login(dto, req);

    expect(authService.login).toHaveBeenCalledWith(dto, '127.0.0.1');
    expect(res).toHaveProperty('accessToken');
  });

  it('should call authService.refresh', async () => {
    const dto = { refreshToken: 'refresh.token' };
    const res = await controller.refresh(dto);

    expect(authService.refresh).toHaveBeenCalledWith('refresh.token');
    expect(res).toHaveProperty('accessToken');
  });

  it('should call authService.logout', async () => {
    const res = await controller.logout(mockUserPayload, { refreshToken: 'refresh.token' });

    expect(authService.logout).toHaveBeenCalledWith('user-1', 'access-jti-1', 'refresh.token');
    expect(res).toEqual({ success: true });
  });

  it('should call authService.getMe', async () => {
    const res = await controller.getMe(mockUserPayload);

    expect(authService.getMe).toHaveBeenCalledWith('user-1');
    expect(res).toHaveProperty('id', 'user-1');
  });

  it('should call authService.setupTotp', async () => {
    const res = await controller.setupTotp(mockUserPayload);

    expect(authService.setupTotp).toHaveBeenCalledWith('user-1');
    expect(res).toHaveProperty('secret');
  });

  it('should call authService.verifyTotp', async () => {
    const res = await controller.verifyTotp(mockUserPayload, { code: '123456' });

    expect(authService.verifyTotp).toHaveBeenCalledWith('user-1', '123456');
    expect(res).toEqual({ success: true });
  });
});
