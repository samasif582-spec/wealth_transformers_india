import { Controller, Get, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('actorId') actorId?: string,
    @Query('actionType') actionType?: string,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.auditService.findAll({ page, limit, actorId, actionType, resourceType });
  }
}
