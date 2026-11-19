import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  private readonly logger = new Logger(MetaSignatureGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const signature = req.headers['x-hub-signature-256'] as string;

    if (!signature || !signature.startsWith('sha256=')) {
      this.logger.warn(`Rejected webhook missing or malformed X-Hub-Signature-256 from IP ${req.ip}`);
      throw new ForbiddenException('Missing or malformed X-Hub-Signature-256 header');
    }

    const appSecret = this.config.get<string>('META_APP_SECRET') || 'dev_meta_app_secret';

    const rawPayload = (req as any).rawBody
      ? (req as any).rawBody
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    const payloadBuffer = Buffer.isBuffer(rawPayload)
      ? rawPayload
      : Buffer.from(typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload), 'utf8');

    const expectedHex = crypto.createHmac('sha256', appSecret).update(payloadBuffer).digest('hex');
    const expectedSignature = `sha256=${expectedHex}`;

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
      this.logger.warn(`Invalid webhook HMAC signature from IP ${req.ip}`);
      throw new ForbiddenException('Invalid webhook signature');
    }

    return true;
  }
}
