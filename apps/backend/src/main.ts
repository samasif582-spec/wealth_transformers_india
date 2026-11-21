import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  // Raw body needed for HMAC webhook signature verification
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: true,
  });

  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const port = config.get<number>('PORT', 3000);
  const apiBaseUrl = config.get<string>('VITE_API_BASE_URL', 'http://localhost:5173');
  const sentryDsn = config.get<string>('SENTRY_DSN_BACKEND');

  // ── Sentry error monitoring ────────────────────────────────────────────────
  if (sentryDsn && nodeEnv === 'production') {
    Sentry.init({
      dsn: sentryDsn,
      environment: nodeEnv,
      tracesSampleRate: 0.1,
      beforeSend(event: any) {
        // Scrub PII from Sentry payloads
        const eventStr = JSON.stringify(event);
        const scrubbed = eventStr
          .replace(/\+?[0-9]{10,15}/g, '[PHONE_REDACTED]')
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
        return JSON.parse(scrubbed);
      },
    });
  }

  // ── Body limits ────────────────────────────────────────────────────────────
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  // ── Security headers (Helmet) ──────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'", 'https://sentry.io'],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      xssFilter: true,
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = [
    apiBaseUrl,
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-Api-Key'],
  });

  // ── Global API prefix ─────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Global exception filter ───────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter(nodeEnv));

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  console.warn(`🚀 Backend running on http://localhost:${port}/api/v1`);
  console.warn(`📋 Environment: ${nodeEnv}`);
}

void bootstrap();
