import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from '../users.controller';
import { UsersService } from '../users.service';
import { UserRole, AccountStatus } from '@prisma/client';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: any;

  const mockActor = {
    sub: 'admin-id-1',
    role: UserRole.Admin,
    jti: 'admin-jti-1',
  };

  const mockUser = {
    id: 'user-uuid-1',
    email: 'operator@wealthtrade.in',
    fullName: 'Test Operator',
    role: UserRole.Operator,
    accountStatus: AccountStatus.ACTIVE,
  };

  beforeEach(async () => {
    usersService = {
      create: jest.fn().mockResolvedValue(mockUser),
      findAll: jest.fn().mockResolvedValue({
        data: [mockUser],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
      findById: jest.fn().mockResolvedValue(mockUser),
      update: jest.fn().mockResolvedValue(mockUser),
      softDelete: jest.fn().mockResolvedValue({
        ...mockUser,
        accountStatus: AccountStatus.INACTIVE,
        deletedAt: new Date(),
      }),
      unlock: jest.fn().mockResolvedValue({
        ...mockUser,
        accountStatus: AccountStatus.ACTIVE,
      }),
      updateRole: jest.fn().mockResolvedValue({
        ...mockUser,
        role: UserRole.Admin,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create user', async () => {
    const dto = {
      email: 'operator@wealthtrade.in',
      fullName: 'Test Operator',
      password: 'Password@123',
      role: UserRole.Operator,
    };
    const res = await controller.create(dto, mockActor);
    expect(usersService.create).toHaveBeenCalledWith(dto, 'admin-id-1', UserRole.Admin);
    expect(res).toEqual(mockUser);
  });

  it('should return paginated users', async () => {
    const filter = { page: 1, limit: 10 };
    const res = await controller.findAll(filter);
    expect(usersService.findAll).toHaveBeenCalledWith(filter);
    expect(res.data).toHaveLength(1);
  });

  it('should find user by id', async () => {
    const res = await controller.findOne('user-uuid-1');
    expect(usersService.findById).toHaveBeenCalledWith('user-uuid-1');
    expect(res).toEqual(mockUser);
  });

  it('should update user', async () => {
    const dto = { fullName: 'Updated Name' };
    const res = await controller.update('user-uuid-1', dto, mockActor);
    expect(usersService.update).toHaveBeenCalledWith('user-uuid-1', dto, 'admin-id-1', UserRole.Admin);
    expect(res).toEqual(mockUser);
  });

  it('should soft delete user', async () => {
    const res = await controller.remove('user-uuid-1', mockActor);
    expect(usersService.softDelete).toHaveBeenCalledWith('user-uuid-1', 'admin-id-1', UserRole.Admin);
    expect(res.accountStatus).toBe(AccountStatus.INACTIVE);
  });

  it('should unlock user', async () => {
    const res = await controller.unlock('user-uuid-1', mockActor);
    expect(usersService.unlock).toHaveBeenCalledWith('user-uuid-1', 'admin-id-1', UserRole.Admin);
    expect(res.accountStatus).toBe(AccountStatus.ACTIVE);
  });

  it('should update user role', async () => {
    const res = await controller.updateRole('user-uuid-1', { role: UserRole.Admin }, mockActor);
    expect(usersService.updateRole).toHaveBeenCalledWith(
      'user-uuid-1',
      UserRole.Admin,
      'admin-id-1',
      UserRole.Admin,
    );
    expect(res.role).toBe(UserRole.Admin);
  });
});
