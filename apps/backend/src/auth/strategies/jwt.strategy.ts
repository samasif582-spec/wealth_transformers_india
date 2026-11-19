import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(config: ConfigService) {
    const pubKeyRaw = config.get<string>('JWT_PUBLIC_KEY', '');
    const pubKey = pubKeyRaw
      ? Buffer.from(pubKeyRaw, 'base64').toString('utf-8')
      : 'dummy_public_key_for_scaffold';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: pubKey,
      algorithms: ['RS256'],
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub || !payload.role) {
      this.logger.warn('Invalid JWT payload structure');
      throw new UnauthorizedException('Invalid token');
    }
    return payload;
  }
}
