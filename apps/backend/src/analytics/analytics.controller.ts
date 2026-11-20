import { Controller, Get, Post, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  async getDashboard(@Query('days') days = '7') {
    const daysCount = parseInt(days, 10) || 7;
    const startDate = new Date(Date.now() - (daysCount - 1) * 24 * 60 * 60 * 1000);
    const timeSeries = await this.analyticsService.getTimeSeries(startDate, daysCount);
    return {
      message: 'Analytics dashboard — Phase 6',
      status: 'healthy',
      timeSeries,
    };
  }

  @Get('campaigns/:id/export')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  async exportCsv(@Param('id') campaignId: string, @Res() res: Response): Promise<void> {
    const csv = await this.analyticsService.exportCampaignCsv(campaignId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaignId}.csv"`);
    res.status(200).send(csv);
  }

  @Get('failed-logs')
  @Roles(UserRole.Admin)
  async getFailedLogs() {
    return this.analyticsService.getFailedLogs();
  }

  @Get('queue-stats')
  @Roles(UserRole.Admin)
  async getQueueStats() {
    return this.analyticsService.getQueueStats();
  }

  @Post('failed-logs/:id/retry')
  @Roles(UserRole.Admin)
  async retryFailedLog(@Param('id') id: string) {
    return this.analyticsService.retryFailedLog(id);
  }

  @Post('failed-logs/retry-all')
  @Roles(UserRole.Admin)
  async retryAllFailedLogs() {
    return this.analyticsService.retryAllFailedLogs();
  }
}
