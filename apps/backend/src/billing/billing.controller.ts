import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BillingService } from './billing.service';
import { ShareReportDto } from './dto/billing.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('usage')
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Marketing_Employee)
  async getUsage(@Query('cycle') cycle?: string) {
    return this.billingService.getUsageOverview(cycle);
  }

  @Get('extra-cost-report')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  async getExtraCostReport(@Query('cycle') cycle?: string) {
    return this.billingService.getDetailedExtraCostReport(cycle);
  }

  @Post('share-report')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  async shareReport(@Body() dto: ShareReportDto) {
    return this.billingService.shareReportWithInternalTeam(dto);
  }
}
