import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Viewer)
  @HttpCode(HttpStatus.OK)
  findAll() {
    return this.settingsService.getAll();
  }

  @Patch(':key')
  @Roles(UserRole.Super_Admin)
  @HttpCode(HttpStatus.OK)
  update(
    @Param('key') key: string,
    @Body('value') value: any,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.settingsService.update(key, value, actor?.sub);
  }
}
