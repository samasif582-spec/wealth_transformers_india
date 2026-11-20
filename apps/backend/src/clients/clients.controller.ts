import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { ErasureRequestDto } from './dto/erasure-request.dto';
import { JwtPayload } from '../auth/auth.service';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  findAll(@Query() query: QueryClientsDto) {
    return this.clientsService.findAll(query);
  }

  @Get('stats')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  getStats() {
    return this.clientsService.getStats();
  }

  @Post()
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateClientDto, @CurrentUser() actor: JwtPayload) {
    return this.clientsService.create(dto, actor?.sub);
  }

  @Post('import')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  importClients(
    @UploadedFile() file: { buffer?: Buffer; path?: string; originalname?: string },
    @CurrentUser() actor: JwtPayload,
  ) {
    if (!file) {
      throw new BadRequestException('Import file is required');
    }
    return this.clientsService.import(file, actor?.sub);
  }

  @Get('export')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  exportClients(@Query() query: QueryClientsDto) {
    return this.clientsService.export(query);
  }

  @Get(':id')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.clientsService.update(id, dto, actor?.sub);
  }

  @Delete(':id')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.clientsService.softDelete(id, actor?.sub);
  }

  @Post(':id/restore')
  @Roles(UserRole.Super_Admin)
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.clientsService.restore(id, actor?.sub);
  }

  @Post(':id/erasure')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  eraseClient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ErasureRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.clientsService.eraseClient(id, dto, actor?.sub);
  }

  // Alias for compatibility
  @Post(':id/erase')
  @Roles(UserRole.Super_Admin, UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  eraseAlias(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: JwtPayload,
    @Body() dto?: ErasureRequestDto,
  ) {
    const erasureDto: ErasureRequestDto = dto && dto.confirmed !== undefined
      ? dto
      : { confirmed: true, reason: 'Right-to-erasure requested' };
    return this.clientsService.eraseClient(id, erasureDto, actor?.sub);
  }
}
