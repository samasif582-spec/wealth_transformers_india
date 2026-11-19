import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('integrations/whatsapp/health')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  getHealth() {
    return this.adminService.getWhatsAppHealth();
  }

  @Post('integrations/whatsapp/test-dispatch')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  testDispatch(
    @Body() body: { testPhoneNumber: string; templateName?: string; messageText?: string },
  ) {
    return this.adminService.testCanaryDispatch(body);
  }

  @Post('production/emergency-pause')
  @Roles(UserRole.Super_Admin)
  @HttpCode(HttpStatus.OK)
  emergencyPause(
    @Body() body: { reason?: string },
    @CurrentUser('email') email?: string,
  ) {
    return this.adminService.emergencyPause(
      body.reason || 'Manual emergency stop triggered via Admin API',
      email || 'superadmin@wealthtransformers.in',
    );
  }

  @Post('production/resume-dispatch')
  @Roles(UserRole.Super_Admin)
  @HttpCode(HttpStatus.OK)
  resumeDispatch(@CurrentUser('email') email?: string) {
    return this.adminService.resumeDispatch(email || 'superadmin@wealthtransformers.in');
  }

  @Post('compliance/verify')
  @Roles(UserRole.Super_Admin)
  @HttpCode(HttpStatus.OK)
  verifyCompliance(
    @Body() body: { acknowledgedRisk: boolean },
    @CurrentUser('email') email?: string,
  ) {
    return this.adminService.verifyCompliance(
      email || 'superadmin@wealthtransformers.in',
      body.acknowledgedRisk,
    );
  }
}
