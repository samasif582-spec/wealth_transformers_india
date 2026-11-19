import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pubKeyRaw = config.get<string>('JWT_PUBLIC_KEY', '');
        const privKeyRaw = config.get<string>('JWT_PRIVATE_KEY', '');
        return {
          publicKey: pubKeyRaw
            ? Buffer.from(pubKeyRaw, 'base64').toString('utf-8')
            : undefined,
          privateKey: privKeyRaw
            ? Buffer.from(privKeyRaw, 'base64').toString('utf-8')
            : undefined,
          signOptions: {
            algorithm: 'RS256',
            expiresIn: Number(config.get<number>('JWT_ACCESS_TOKEN_TTL', 900)),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
