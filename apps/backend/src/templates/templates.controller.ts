import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { FilterTemplateDto } from './dto/filter-template.dto';
import { TemplatePreviewDto } from './dto/template-preview.dto';

@Controller('templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTemplateDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.templatesService.create(dto, userId);
  }

  @Post('preview')
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: TemplatePreviewDto) {
    return this.templatesService.preview(dto);
  }

  @Post('sync-waba')
  @Roles(UserRole.Admin, UserRole.Super_Admin)
  @HttpCode(HttpStatus.OK)
  syncWaba() {
    return this.templatesService.syncWabaTemplates();
  }

  @Get()
  @Roles(UserRole.Viewer)
  @HttpCode(HttpStatus.OK)
  findAll(@Query() filters: FilterTemplateDto) {
    return this.templatesService.findAll(filters);
  }

  @Get(':id')
  @Roles(UserRole.Viewer)
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOne(id);
  }

  @Post(':id/versions')
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.CREATED)
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTemplateVersionDto,
  ) {
    return this.templatesService.createVersion(id, dto);
  }

  @Post(':id/submit')
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.OK)
  submitForApproval(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.submitForApproval(id);
  }

  @Post(':id/sync-quality')
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.OK)
  syncQuality(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.syncQuality(id);
  }

  @Delete(':id')
  @Roles(UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.archive(id);
  }
}
