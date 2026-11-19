import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ConfigService } from '@nestjs/config';
import { MetaSignatureGuard } from './guards/meta-signature.guard';
import { WebhooksService } from './webhooks.service';

@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly config: ConfigService,
    private readonly webhooksService: WebhooksService,
  ) {}

  /** Meta webhook verification handshake - supports both /meta and /whatsapp */
  @Public()
  @Get(['meta', 'whatsapp'])
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const verifyToken = this.config.get<string>('META_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  /** Meta webhook POST — return 200 fast, process async - supports both /meta and /whatsapp */
  @Public()
  @UseGuards(MetaSignatureGuard)
  @Post(['meta', 'whatsapp'])
  @HttpCode(HttpStatus.OK)
  receiveWebhook(@Body() body: any): { status: string } {
    // Process asynchronously without blocking HTTP 200 response
    this.webhooksService.processWebhook(body).catch(() => {});
    return { status: 'received' };
  }
}
