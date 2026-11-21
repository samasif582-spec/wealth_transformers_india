import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserRole, CampaignStatus, CampaignType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: CampaignStatus,
    @Query('type') type?: CampaignType,
    @Query('search') search?: string,
  ) {
    return this.campaignsService.findAll({ page, limit, status, type, search });
  }

  @Get(':id')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCampaignDto, @CurrentUser() actor: JwtPayload) {
    return this.campaignsService.create(dto, actor?.sub);
  }

  @Post(':id/approve')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.campaignsService.approve(id, actor?.sub);
  }

  @Post(':id/reject')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.campaignsService.reject(id, reason || 'Rejected by administrator', actor?.sub);
  }

  @Post([':id/send', ':id/dispatch'])
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  dispatch(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.campaignsService.dispatch(id, actor?.sub);
  }

  @Post(':id/pause')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.campaignsService.pause(id, actor?.sub);
  }

  @Post(':id/resume')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: JwtPayload) {
    return this.campaignsService.resume(id, actor?.sub);
  }

  @Post(':id/cancel')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.campaignsService.cancel(id, reason, actor?.sub);
  }
}
