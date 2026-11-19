import {
  Controller,
  Get,
  Post,
  Body,
  Param,
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
import { ConsentService } from './consent.service';
import { RecordConsentDto } from './dto/record-consent.dto';
import { InboundOptOutDto } from './dto/inbound-optout.dto';
import { OptInDto, OptOutDto, ExportConsentDto } from './dto/consent.dto';
import { JwtPayload } from '../auth/auth.service';

@Controller('consent')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Operator)
  @HttpCode(HttpStatus.CREATED)
  recordConsent(
    @Body() dto: RecordConsentDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.consentService.recordManualConsent(dto, actor?.sub);
  }

  @Post('opt-in')
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Operator)
  @HttpCode(HttpStatus.CREATED)
  optIn(
    @Body() dto: OptInDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.consentService.optIn(
      dto.clientId,
      dto.reason,
      dto.source,
      dto.evidenceReference ? { evidence: dto.evidenceReference } : undefined,
      actor?.sub,
    );
  }

  @Post('opt-out')
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Operator)
  @HttpCode(HttpStatus.CREATED)
  optOut(
    @Body() dto: OptOutDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.consentService.optOut(
      dto.clientId,
      dto.reason,
      dto.source,
      actor?.sub,
    );
  }

  @Post('inbound')
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Operator)
  @HttpCode(HttpStatus.OK)
  handleInbound(@Body() dto: InboundOptOutDto) {
    return this.consentService.handleInboundOptOut(dto);
  }

  @Get(':clientId')
  @Roles(
    UserRole.Super_Admin,
    UserRole.Admin,
    UserRole.Marketing_Employee,
    UserRole.Operator,
    UserRole.Viewer,
  )
  @HttpCode(HttpStatus.OK)
  getHistory(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.consentService.getConsentHistory(clientId);
  }

  @Post('export')
  @Roles(UserRole.Super_Admin, UserRole.Admin, UserRole.Marketing_Employee)
  @HttpCode(HttpStatus.OK)
  exportRegister(@Body() dto?: ExportConsentDto) {
    return this.consentService.exportRegister(dto as any);
  }
}
