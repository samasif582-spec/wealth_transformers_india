import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { UsersService, PaginatedUsersResponse } from './users.service';
import { SanitizedUser } from '../auth/auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { JwtPayload } from '../auth/auth.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SanitizedUser> {
    return this.usersService.create(
      dto,
      actor?.sub,
      actor?.role as UserRole,
    );
  }

  @Get()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async findAll(@Query() filter: UserFilterDto): Promise<PaginatedUsersResponse> {
    return this.usersService.findAll(filter);
  }

  @Get(':id')
  @Roles(
    UserRole.Super_Admin,
    UserRole.Admin,
    UserRole.Marketing_Employee,
    UserRole.Operator,
    UserRole.Viewer,
  )
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SanitizedUser> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SanitizedUser> {
    return this.usersService.update(
      id,
      dto,
      actor?.sub,
      actor?.role as UserRole,
    );
  }

  @Delete(':id')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SanitizedUser> {
    return this.usersService.softDelete(
      id,
      actor?.sub,
      actor?.role as UserRole,
    );
  }

  @Post(':id/unlock')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SanitizedUser> {
    return this.usersService.unlock(
      id,
      actor?.sub,
      actor?.role as UserRole,
    );
  }

  @Patch(':id/role')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SanitizedUser> {
    return this.usersService.updateRole(
      id,
      dto.role,
      actor.sub,
      actor.role as UserRole,
    );
  }
}
