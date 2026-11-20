import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AutomationService } from './automation.service';

@Controller('automation')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get('workflows')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  listWorkflows() {
    return this.automationService.listWorkflows();
  }

  @Post('workflows/:id/trigger')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  triggerWorkflow(@Param('id') id: string) {
    return this.automationService.triggerWorkflow(id);
  }
}
