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
import { MediaService } from './media.service';
import { PresignedUploadDto } from './dto/presigned-upload.dto';
import { QueryMediaDto } from './dto/query-media.dto';

@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('presigned-upload')
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.OK)
  createPresignedUpload(
    @Body() dto: PresignedUploadDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mediaService.createPresignedUpload(dto, userId);
  }

  @Get('quota')
  @Roles(UserRole.Operator)
  @HttpCode(HttpStatus.OK)
  getStorageQuota() {
    return this.mediaService.getStorageQuota();
  }

  @Get(':id/presigned-download')
  @Roles(UserRole.Operator)
  @HttpCode(HttpStatus.OK)
  getPresignedDownload(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getPresignedDownload(id);
  }

  @Post(':id/confirm')
  @Roles(UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.OK)
  confirmUpload(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.confirmUpload(id);
  }

  @Get()
  @Roles(UserRole.Operator)
  @HttpCode(HttpStatus.OK)
  findAll(@Query() query: QueryMediaDto) {
    return this.mediaService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.Operator)
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.delete(id);
  }
}
