import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  AuthService,
  JwtPayload,
  LoginResponse,
  SanitizedUser,
  TokenPair,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TotpVerifyDto } from './dto/totp-verify.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
  ): Promise<LoginResponse> {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    return this.authService.login(loginDto, ip);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() body?: { refreshToken?: string },
  ): Promise<{ success: boolean }> {
    return this.authService.logout(user.sub, user.jti, body?.refreshToken);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: JwtPayload): Promise<SanitizedUser> {
    return this.authService.getMe(user.sub);
  }

  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  async setupTotp(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ secret: string; qrCodeDataUrl: string }> {
    return this.authService.setupTotp(user.sub);
  }

  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTotp(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TotpVerifyDto,
  ): Promise<{ success: boolean }> {
    return this.authService.verifyTotp(user.sub, dto.code);
  }
}
