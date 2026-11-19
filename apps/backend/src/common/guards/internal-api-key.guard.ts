import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const providedKey = req.headers['x-internal-api-key'] as string;

    if (!providedKey) {
      throw new UnauthorizedException('Missing X-Internal-Api-Key header');
    }

    const expectedSecret =
      this.config.get<string>('INTERNAL_API_SECRET') || 'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6';

    const providedBuf = Buffer.from(providedKey, 'utf8');
    const expectedBuf = Buffer.from(expectedSecret, 'utf8');

    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      throw new ForbiddenException('Forbidden: Invalid internal API key');
    }

    return true;
  }
}
