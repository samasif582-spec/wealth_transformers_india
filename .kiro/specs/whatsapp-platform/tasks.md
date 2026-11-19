# Implementation Plan: Wealth Trade WhatsApp Customer Engagement & Automation Platform

## Overview

This plan breaks the full platform build into 14 sequential phases, moving from repository scaffold through production deployment. Every task targets a single developer and references concrete file paths, commands, and done criteria. All 17 requirements are covered. Property-based tests for Correctness Properties P1â€“P8 appear in Phase 14.

The monorepo layout is:

```
/
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ backend/          NestJS 10 + Prisma
â”‚   â””â”€â”€ frontend/         React 18 + Vite
â”œâ”€â”€ n8n/                  Workflow JSON exports + Docker env
â”œâ”€â”€ docker-compose.dev.yml
â”œâ”€â”€ docker-compose.prod.yml
â”œâ”€â”€ nginx/
â”‚   â”œâ”€â”€ nginx.dev.conf
â”‚   â””â”€â”€ nginx.prod.conf
â””â”€â”€ .env.example
```

---

## Tasks

---

### Phase 1: Foundation & Infrastructure Setup

- [ ] 1. Scaffold monorepo and shared tooling
  - [ ] 1.1 Initialise the root package.json workspace
    - Create `/package.json` with `"workspaces": ["apps/*"]`, Node 20 engines constraint
    - Create `/.nvmrc` pinning Node 20 LTS
    - Create `/.gitignore` covering `node_modules`, `dist`, `.env*` (but not `.env.example`), `*.log`, `.DS_Store`
    - Create `/tsconfig.base.json` with `strict: true`, `moduleResolution: bundler`, `target: ES2022`
    - Install root-level dev deps: `typescript@5`, `eslint@9`, `prettier@3`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-config-prettier`
    - Create `/.eslintrc.cjs` extending `@typescript-eslint/recommended` and `prettier`
    - Create `/.prettierrc` with `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`
    - _Requirements: 14.9_

  - [ ] 1.2 Create the `.env.example` file documenting every environment variable
    - Document variables for: `DATABASE_URL`, `REDIS_URL`, `REDIS_PASSWORD`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`, `INTERNAL_API_SECRET`, `SENTRY_DSN_BACKEND`, `VITE_API_BASE_URL`, `VITE_SENTRY_DSN_FRONTEND`, `WORKER_CONCURRENCY` (default 10), `META_MESSAGES_PER_SECOND` (default 80), `N8N_BASIC_AUTH_USER`, `N8N_BASIC_AUTH_PASSWORD`, `N8N_DB_NAME`, `N8N_DB_USER`, `N8N_DB_PASSWORD`, `N8N_ENCRYPTION_KEY`, `DOMAIN`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `STORAGE_QUOTA_BYTES`, `FORCE_HTTPS`
    - Add a comment block explaining each variable's purpose and valid value format
    - _Requirements: 13.2, 14.9_

- [ ] 2. Docker Compose â€” development and production
  - [ ] 2.1 Write `docker-compose.dev.yml`
    - Services: `postgres` (postgres:15-alpine, port 5432 exposed), `redis` (redis:7-alpine with `--requirepass ${REDIS_PASSWORD}`, port 6379 exposed), `n8n` (n8nio/n8n:latest, port 5678 exposed, `DB_TYPE=postgresdb` pointing at postgres service)
    - Define named volumes `postgres-data`, `redis-data`, `n8n-data`
    - Both services on `internal-net` bridge network
    - Add health checks: postgres `pg_isready -U ${POSTGRES_USER}`, redis `redis-cli -a ${REDIS_PASSWORD} ping`
    - _Requirements: 14.5_

  - [ ] 2.2 Write `apps/backend/Dockerfile.prod`
    - Multi-stage build: `builder` stage â€” `node:20-alpine`, `npm ci`, `npx prisma generate`, `npm run build`; `runner` stage â€” copy `dist/`, `node_modules/`, `prisma/`, `package.json`; create non-root user `appuser`; `EXPOSE 3000`; `HEALTHCHECK` calling `GET /api/v1/health`; `CMD` runs `npx prisma migrate deploy && node dist/main.js`
    - _Requirements: 14.6, 14.7_

  - [ ] 2.3 Write `docker-compose.prod.yml`
    - Services: `nginx` (nginx:1.25-alpine, ports 80 + 443, volumes for certs and certbot webroot), `certbot` (certbot/certbot with 12h renewal loop), `backend` (built from `apps/backend/Dockerfile.prod`, expose 3000, all env vars injected, depends on postgres + redis), `postgres` (postgres:15-alpine, SSL enabled, WAL archiving on, volume mounted, internal only), `redis` (redis:7-alpine with AOF `--appendonly yes --appendfsync everysec`, internal only), `n8n` (internal only, depends on postgres + backend)
    - Two networks: `public-net` (nginx only facing internet), `internal-net` (all services, `internal: true`)
    - All secrets via env vars only â€” no hardcoded values in the compose file
    - _Requirements: 9.8, 14.5, 14.9_

- [ ] 3. NestJS backend scaffold
  - [ ] 3.1 Initialise the NestJS application
    - Run `npx @nestjs/cli new backend --package-manager npm --skip-git` inside `apps/`
    - Set `apps/backend/tsconfig.json` to extend `../../tsconfig.base.json`
    - Install production dependencies: `@nestjs/config`, `@nestjs/throttler`, `@nestjs/bull` (BullMQ integration), `bullmq`, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt`, `speakeasy`, `qrcode`, `ioredis`, `prisma`, `@prisma/client`, `class-validator`, `class-transformer`, `helmet`, `@sentry/node`, `nodemailer`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `papaparse`, `libphonenumber-js`, `file-type`, `jsPDF`, `csv-stringify`, `zod`, `crypto` (built-in)
    - Install dev dependencies: `jest`, `@nestjs/testing`, `ts-jest`, `supertest`, `testcontainers`, `fast-check`
    - Create `apps/backend/src/app.module.ts` importing all 14 feature modules plus `ConfigModule.forRoot({ isGlobal: true })` and `ThrottlerModule`
    - _Requirements: all_

  - [ ] 3.2 Register all 14 NestJS modules as empty stubs
    - Create stub `module.ts`, `service.ts`, `controller.ts` for each: `AuthModule`, `UsersModule`, `ClientsModule`, `ConsentModule`, `TemplatesModule`, `MediaModule`, `CampaignsModule`, `WebhooksModule`, `AnalyticsModule`, `AutomationModule`, `AuditModule`, `QueueModule`, `SettingsModule`, `HealthModule`
    - Each module exports its service so other modules can import it
    - Register all in `AppModule` imports array
    - _Requirements: all_

- [ ] 4. Prisma schema and database setup
  - [ ] 4.1 Write the full Prisma schema
    - Create `apps/backend/prisma/schema.prisma` with all enums and 20 models exactly as specified in `design.md` data models section: `User`, `Client`, `ClientTag`, `WhatsappConsent`, `MessageTemplate`, `TemplateVersion`, `Campaign`, `CampaignRecipient`, `CampaignStateTransition`, `MessageLog`, `WebhookEvent`, `MediaAsset`, `AutomationRule`, `AutomationExecution`, `AuditLog`, `ApplicationSetting`, `NotificationChannel`
    - Set `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`
    - Enable `previewFeatures = ["fullTextSearch"]`
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.7, 10.2, 12.1_

  - [ ] 4.2 Create supplemental SQL migrations
    - Create `apps/backend/prisma/migrations/0001_supplements.sql` with:
      - Full-text search trigger `clients_search_vector_update()` and `CREATE INDEX clients_search_vector_idx ON clients USING GIN (search_vector)`
      - Row-Level Security on `audit_logs`: `ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY` + `CREATE POLICY audit_insert_only ON audit_logs FOR INSERT TO app_role WITH CHECK (true)` (no UPDATE/DELETE policy)
      - `delivery_status_ordinal()` immutable SQL function
      - `update_delivery_status_monotonic()` function
      - `notify_settings_changed()` trigger function and `settings_notify_trigger` on `application_settings`
      - Composite index `message_logs_analytics_idx ON message_logs (campaign_id, delivery_status, dispatched_at)`
      - Partial index `webhook_events_expires_at_idx ON webhook_events (expires_at) WHERE processing_status = 'PROCESSED'`
    - _Requirements: 3.7, 7.5, 12.2, 11.8_

  - [ ] 4.3 Create the `mv_campaign_stats` materialized view migration
    - Create `apps/backend/prisma/migrations/0002_campaign_stats_view.sql` with the full `CREATE MATERIALIZED VIEW mv_campaign_stats` SQL from `design.md`, including `CREATE UNIQUE INDEX mv_campaign_stats_pk ON mv_campaign_stats (campaign_id)`
    - _Requirements: 11.1, 11.2_

  - [ ] 4.4 Write a database seed script
    - Create `apps/backend/prisma/seed.ts`
    - Seed one `Super_Admin` user (hashed password via bcrypt cost 12) and default `ApplicationSetting` rows: `meta_pricing` JSONB with MARKETING/UTILITY/AUTHENTICATION rates and `effective_date` of 2026-10-01, `opt_out_keywords` per language (en: STOP, UNSUBSCRIBE, OPT OUT), `worker_concurrency` = 10, `meta_messages_per_second` = 80, `data_retention_clients_years` = 7, `data_retention_messages_years` = 5
    - Configure `prisma.config.ts` to run seed with `ts-node`
    - _Requirements: 17.1_

---

### Phase 2: Backend Core â€” Authentication & RBAC

- [ ] 5. Implement AuthModule
  - [ ] 5.1 Generate RS256 key pair utility and JWT service
    - Create `apps/backend/src/auth/jwt.strategy.ts` implementing `PassportStrategy(Strategy)` with RS256, extract Bearer from header, validate against Redis denylist (`auth:denylist:{jti}`) and inactivity (`auth:activity:{userId}` â€” reject if last activity > 60 min ago)
    - Create `apps/backend/src/auth/auth.service.ts` with methods: `validateCredentials(email, password)` â€” bcrypt compare cost 12, increment Redis lockout counter `auth:lockout:{userId}` INCR + EXPIRE 900; `issueTokenPair(userId, role)` â€” sign access JWT (RS256, 15 min, `{sub, role, jti}`) and refresh JWT (RS256, 7d); `rotateRefreshToken(userId, oldJti, newRefreshToken)` â€” add old jti to denylist with TTL, update `refresh_token_hash`; `verifyTotpCode(userId, code)` â€” `speakeasy.totp.verify(window: 1)`; `setupTotp(userId)` â€” generate secret, encrypt, store in `users.totp_secret`, return QR code via `qrcode`
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.7, 1.9_

  - [ ] 5.2 Implement account lockout and login endpoint
    - Create `apps/backend/src/auth/auth.controller.ts` with:
      - `POST /api/v1/auth/login` â€” validate body with DTO (`email`, `password`), call `validateCredentials`, enforce lockout (counter â‰¥ 5 â†’ 401 `account_locked`), if `totp_enabled` return `{ mfa_required: true, mfa_token }` else issue `TokenPair`; write `AuditLog` LOGIN entry
      - `POST /api/v1/auth/refresh` â€” validate refresh token, rotate, return new `TokenPair`
      - `POST /api/v1/auth/logout` â€” add refresh token JTI to Redis denylist, write `AuditLog` LOGOUT entry
      - `POST /api/v1/auth/totp/setup` â€” generate TOTP secret + QR
      - `POST /api/v1/auth/totp/verify` â€” verify code, complete login flow
    - Apply `ThrottlerGuard` with 20 req/min on all auth endpoints
    - _Requirements: 1.1, 1.2, 1.6, 1.9_

  - [ ] 5.3 Implement JwtAuthGuard, RolesGuard, PermissionsGuard
    - Create `apps/backend/src/auth/guards/jwt-auth.guard.ts` â€” extends `AuthGuard('jwt')`, checks Redis denylist, checks inactivity, updates `auth:activity:{userId}` on pass
    - Create `apps/backend/src/auth/guards/roles.guard.ts` â€” reads `@Roles()` decorator from handler/class, compares with `request.user.role`
    - Create `apps/backend/src/auth/guards/permissions.guard.ts` â€” reads `@RequirePermissions()`, queries `role_permissions` table via `PrismaService`
    - Create `apps/backend/src/auth/decorators/roles.decorator.ts` and `require-permissions.decorator.ts`
    - Register guards globally in `AppModule` with `APP_GUARD` provider order: JwtAuthGuard â†’ RolesGuard â†’ PermissionsGuard
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ] 5.4 Implement UsersModule CRUD and role management
    - Create `apps/backend/src/users/users.service.ts`: `create(dto)` â€” hash password bcrypt 12, write `AuditLog` CREATE in same Prisma transaction; `updateRole(userId, newRole)` â€” atomic update + `AuditLog` ROLE_CHANGE + publish `auth:invalidate:{userId}` to Redis; `softDelete(userId)` â€” set `deleted_at`, write `AuditLog` DELETE; `unlock(userId)` â€” clear `locked_at`, clear `auth:lockout:{userId}` Redis key
    - Create `apps/backend/src/users/users.controller.ts` with all 7 endpoints from `design.md` API table, applying `@Roles()` guards per row
    - Subscribe to `auth:invalidate:{userId}` in `JwtAuthGuard` to immediate-revoke tokens (Requirement 2.7)
    - _Requirements: 2.5, 2.7, 2.8_

- [ ] 6. Implement AuditInterceptor and rate-limiting
  - [ ] 6.1 Create the AuditInterceptor
    - Create `apps/backend/src/audit/audit.interceptor.ts` implementing `NestInterceptor`; on every mutating request (POST/PATCH/DELETE) call `AuditService.log()` inside a Prisma transaction with the same write operation; capture before-state and after-state as JSON; record `actorId`, `actorRole`, `ipAddress`, `actionType` inferred from HTTP method + route
    - Create `apps/backend/src/audit/audit.service.ts` with `log(entry: CreateAuditLogDto)` that calls `prisma.auditLog.create()`
    - Register interceptor globally via `APP_INTERCEPTOR` in `AppModule`
    - _Requirements: 12.1, 12.5_

  - [ ] 6.2 Configure Helmet security headers and CORS
    - In `apps/backend/src/main.ts`: call `app.use(helmet())` with explicit CSP matching `design.md` security section values (`default-src 'self'`, `script-src 'self'`, `connect-src 'self' https://sentry.io`, `img-src 'self' data:`, `frame-ancestors 'none'`); `X-Frame-Options: DENY`; `HSTS max-age=31536000; includeSubDomains`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`
    - Configure CORS to allow only `VITE_API_BASE_URL` origin, with `credentials: true`
    - Enable raw body parsing (`NestFactory.create(AppModule, { rawBody: true })`) required for HMAC signature verification
    - _Requirements: 13.4, 13.11_

  - [ ] 6.3 Configure GlobalExceptionFilter and Prisma error mapping
    - Create `apps/backend/src/common/filters/global-exception.filter.ts` matching the implementation in `design.md` error handling section â€” strips internal detail from production responses, captures to Sentry with PII scrubbing via `beforeSend`
    - Create `apps/backend/src/common/utils/prisma-error.mapper.ts` mapping P2002 â†’ 409, P2025 â†’ 404, P2003 â†’ 422
    - _Requirements: 13.10_

---

### Phase 3: Backend â€” Client & Consent Management

- [ ] 7. Implement ClientsModule
  - [ ] 7.1 Client CRUD with E.164 validation and soft delete
    - Create `apps/backend/src/clients/clients.service.ts` with: `create(dto)` â€” normalise phone via `libphonenumber-js`, check E.164 and uniqueness (HTTP 422 on failure), insert with default `communication_consent = PENDING`, write `AuditLog`; `update(id, dto)` â€” same phone validation on change, `AuditLog` UPDATE; `softDelete(id)` â€” set `deleted_at`, write `AuditLog` DELETE; `restore(id)` â€” clear `deleted_at`, set `account_status = INACTIVE`, write `AuditLog` RESTORE; `findAll(filters, pagination)` â€” always add `WHERE deleted_at IS NULL`
    - Create `apps/backend/src/clients/clients.controller.ts` with all 12 endpoints from the API design table
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 7.2 Implement full-text search and filter
    - In `ClientsService.findAll()`: when `q` param present, use Prisma raw `SELECT â€¦ WHERE search_vector @@ plainto_tsquery('english', $1)` with the GIN index; when `q` is a phone prefix (â‰¥ 4 digits), use `WHERE "whatsapp_number" LIKE $1 || '%'`
    - Implement filter builder for `dob_month`, `category_tier`, `communication_consent`, `account_status`, `preferred_language`, `created_at_from`, `created_at_to`
    - Return paginated response `{ data, total, page, pageSize }`
    - _Requirements: 3.7, 3.8_

  - [ ] 7.3 CSV/XLSX import pipeline
    - Create `apps/backend/src/clients/import/client-import.service.ts`: accept multipart file, stream-parse with `papaparse` (CSV) or `xlsx` (XLSX), validate every row against `CreateClientDto`, collect all errors with line numbers, if any errors return structured error report and persist nothing; if all pass, Prisma `createMany` in a single transaction; return `{ imported: N }` or `{ errors: [{ line, field, message }] }`
    - `POST /api/v1/clients/import` returns a job ID; `GET /api/v1/clients/import/:jobId` polls status
    - Honour `consent_status` column in import file per Requirement 3.10
    - _Requirements: 3.5, 3.10_

  - [ ] 7.4 Async CSV export via BullMQ
    - Create `apps/backend/src/clients/workers/client-export.worker.ts` consuming the `client-export` queue: query clients respecting caller's RBAC scope, stringify to CSV with `csv-stringify`, upload to R2 at key `exports/clients/{jobId}.csv`, generate 15-min presigned download URL, deliver URL via in-platform notification (write to `NotificationChannel`); if not done within 10 min, cancel and notify with error
    - `POST /api/v1/clients/export` enqueues job and returns `{ jobId }`; `GET /api/v1/clients/export/:jobId` returns status + presigned URL when ready
    - _Requirements: 3.6_

  - [ ] 7.5 Right-to-erasure anonymization
    - In `ClientsService.erase(id)`: update `full_name`, `whatsapp_number`, `email`, `date_of_birth`, `wedding_anniversary` to `ERASED_{uuid}` deterministic placeholder; update all associated `MessageLog` PII fields with same placeholder; write `AuditLog` with action `DELETE` noting erasure; wrap in Prisma transaction
    - `POST /api/v1/clients/:id/erase` requires `Admin` role
    - _Requirements: 15.2_

- [ ] 8. Implement ConsentModule
  - [ ] 8.1 Immutable consent record creation and opt-out DLQ
    - Create `apps/backend/src/consent/consent.service.ts`: `recordOptIn(clientId, source, evidence, operatorId)` â€” INSERT `WhatsappConsent` row (never UPDATE); `recordOptOut(clientId, source, reason, operatorId)` â€” same INSERT pattern; `getCurrentStatus(clientId)` â€” `SELECT â€¦ ORDER BY recorded_at DESC LIMIT 1`; `getHistory(clientId)` â€” full paginated history; if `create` throws a database error, enqueue to `consent-dlq` queue, suppress Marketing messages for client, alert Super_Admin
    - `POST /api/v1/consent/:clientId/opt-in`, `POST /api/v1/consent/:clientId/opt-out` (requires `reason` 1â€“500 chars)
    - _Requirements: 4.1, 4.2, 4.5, 4.10_

  - [ ] 8.2 Consent Register async export
    - Create `apps/backend/src/consent/workers/consent-export.worker.ts` consuming `consent-export` queue: query all consent records with filters, generate CSV, upload to R2, return 15-min presigned URL
    - `POST /api/v1/consent/export`, `GET /api/v1/consent/export/:jobId`
    - _Requirements: 4.7_

---

### Phase 4: Backend â€” Templates & Media

- [ ] 9. Implement TemplatesModule
  - [ ] 9.1 Template creation and variable validation
    - Create `apps/backend/src/templates/templates.service.ts`: `create(dto)` â€” extract `{{N}}` placeholders via regex `/\{\{(\d+)\}\}/g` from body + header + footer, verify every extracted N has a corresponding `variableDefinition` in the DTO (HTTP 422 otherwise), insert `MessageTemplate` + `TemplateVersion v1` with `status = DRAFT`; `update(id, dto)` â€” only allowed when `status = DRAFT`; `softDelete(id)` â€” check no active/scheduled campaigns reference this template via FK guard, then set `deleted_at`
    - `POST /api/v1/templates`, `PATCH /api/v1/templates/:id`, `DELETE /api/v1/templates/:id`
    - _Requirements: 5.1, 5.2, 5.5, 5.8_

  - [ ] 9.2 Meta Template API submission and approval polling
    - In `TemplatesService.submit(id)`: POST to `https://graph.facebook.com/v20.0/{META_WABA_ID}/message_templates` with bearer `META_ACCESS_TOKEN`; on 200, record `meta_template_id`, set status `PENDING_APPROVAL`, write `AuditLog` TEMPLATE_SUBMIT; on non-200, throw with Meta's error body
    - Create `apps/backend/src/templates/workers/template-status-poll.worker.ts` consuming the `template-status-poll` repeatable queue (every 10 min): fetch all templates in `PENDING_APPROVAL`, call Meta Graph API `GET /v20.0/{metaTemplateId}?fields=status,quality_score`, atomically update `status` and `quality_rating` in DB; if status transitions to `REJECTED`, persist `rejection_reason`
    - _Requirements: 5.3, 5.4_

  - [ ] 9.3 Template versioning and quality rating alerts
    - `POST /api/v1/templates/:id/versions` â€” creates new `TemplateVersion` row, previous version remains immutable; new version inherits parent template's category/language
    - Create `apps/backend/src/templates/workers/template-quality.worker.ts` consuming `template-quality-sync` repeatable queue (every 24h + webhook-triggered): sync quality ratings; if `quality_rating` transitions to `RED`, call `NotificationService.alertAdmins()` and block new campaign creation with that template
    - `GET /api/v1/templates/:id/preview` â€” render body substituting sample Client data provided by caller
    - _Requirements: 5.5, 5.9_

- [ ] 10. Implement MediaModule
  - [ ] 10.1 Presigned upload URL generation and R2 confirmation
    - Create `apps/backend/src/media/media.service.ts`: `generateUploadUrl(dto)` â€” validate `fileType` and `fileSize` against allowed types/sizes (JPEG/PNG â‰¤ 5 MB, PDF â‰¤ 100 MB, MP4 â‰¤ 16 MB), check org storage quota (`SUM(file_size_bytes)` query), use `@aws-sdk/s3-request-presigner` to generate 10-min presigned `PutObject` URL to R2 with key `media/{orgId}/{uuid}.{ext}`, insert `MediaAsset` with `virusScanStatus = PENDING`
    - `confirmUpload(assetId)` â€” verify R2 object exists via `HeadObject`, trigger ClamAV scan via sidecar container, on clean update `upload_confirmed_at` and `virusScanStatus = CLEAN`; on infected: delete R2 object, set `virusScanStatus = INFECTED`, write rejection audit log
    - `POST /api/v1/media/upload-url`, `POST /api/v1/media/confirm-upload`
    - _Requirements: 10.1, 10.2, 13.6_

  - [ ] 10.2 Meta media upload and presigned download URL
    - In `MediaService.uploadToMeta(assetId)`: stream object from R2 `GetObject`, POST to `POST /v20.0/{META_PHONE_NUMBER_ID}/media` with `multipart/form-data`, store `meta_media_id` on `MediaAsset`; if Meta call fails, throw error (Template save rolls back)
    - `generateDownloadUrl(assetId)` â€” create 15-min presigned `GetObject` URL; never serve R2 object key directly as a public URL
    - `softDelete(assetId)` â€” check for active template/campaign references, set `deleted_at` and `r2_purge_at = deletedAt + 30 days`
    - `GET /api/v1/media/:id/download-url`, `DELETE /api/v1/media/:id`
    - _Requirements: 10.3, 10.4, 10.5, 10.6_

---

### Phase 5: Backend â€” Campaigns & Queue

- [ ] 11. Implement QueueModule with BullMQ
  - [ ] 11.1 Set up BullMQ queues, workers, and DLQ pattern
    - Create `apps/backend/src/queue/queue.module.ts` using `BullModule.registerQueue()` for all 10 queues listed in `design.md`: `campaign-messages`, `webhook-processing`, `consent-dlq`, `template-status-poll`, `template-quality-sync`, `client-export`, `campaign-report-export`, `audit-archive`, `retention-cleanup`, `db-backup`
    - Create `apps/backend/src/queue/queue.constants.ts` with `QUEUE_NAMES` and `DEFAULT_JOB_OPTIONS` exactly as in `design.md` (5 attempts, exponential backoff starting 30s)
    - Implement the DLQ `worker.on('failed')` handler: after max attempts, add to `{queue}:dlq`, call `NotificationService.alertSuperAdmin()`
    - Validate `WORKER_CONCURRENCY` env at startup â€” reject with `process.exit(1)` if not 1â€“100
    - _Requirements: 9.1, 9.3, 9.4, 9.6, 9.8_

- [ ] 12. Implement CampaignsModule
  - [ ] 12.1 Campaign creation and audience resolution
    - Create `apps/backend/src/campaigns/campaigns.service.ts`: `create(dto)` â€” INSERT Campaign in `DRAFT` status; `resolveAudience(id)` â€” evaluate `segment_filter` JSONB criteria against `clients` table (always filter `deleted_at IS NULL`, `account_status = ACTIVE`, consent check for MARKETING category), return count within 3s via indexed query, update `resolved_recipient_count`
    - Enforce field validation: `name` unique, `type` in enum, `templateId` must reference an `APPROVED` template
    - `POST /api/v1/campaigns`, `POST /api/v1/campaigns/:id/resolve-audience`
    - _Requirements: 6.1, 6.2, 15.4_

  - [ ] 12.2 Campaign approval workflow
    - In `CampaignsService`: `submitForApproval(id)` â€” transition DRAFT â†’ PENDING_APPROVAL (only for PROMOTIONAL/ANNOUNCEMENT types), write `CampaignStateTransition` row, notify all Admin+ users via in-platform notification within 60s
    - `approve(id, operatorId)` â€” transition PENDING_APPROVAL â†’ APPROVED, record `approved_by_user_id` + `approved_at`, write state transition; `reject(id, operatorId, reason)` â€” reason min 10 chars, transition â†’ REJECTED, notify creating operator
    - `POST /api/v1/campaigns/:id/submit-approval`, `POST /api/v1/campaigns/:id/approve`, `POST /api/v1/campaigns/:id/reject`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [ ] 12.3 Campaign dispatch â€” audience locking and BullMQ job insertion
    - In `CampaignsService.dispatch(id)`: open Prisma transaction â€” resolve final audience with consent revalidation at moment of insertion (Requirement 4.9), INSERT all resolved `clientId`s into `campaign_recipients` with `consent_verified = true`, transition Campaign â†’ EXECUTING, write `CampaignStateTransition`; outside transaction: for each recipient, compute `idempotencyKey = SHA256(campaignId:clientId:executionId)`, check Redis SET NX (24h TTL) to block duplicates, enqueue one BullMQ job on `campaign-messages` queue; return `{ jobCount, campaignId }` HTTP 202
    - `POST /api/v1/campaigns/:id/dispatch`
    - _Requirements: 6.3, 6.4, 6.9, 6.10, 6.11, 9.7_

  - [ ] 12.4 Implement CampaignMessageWorker
    - Create `apps/backend/src/campaigns/workers/campaign-message.worker.ts`: resolve Client record + template variable values from DB; substitute variables into template body/header; call `POST /v20.0/{META_PHONE_NUMBER_ID}/messages` with the `template` message type; on 200: INSERT `MessageLog` with `delivery_status = QUEUED`, `meta_message_id`, `idempotency_key`, `variable_values`, `pricing_rate_inr` (lookup `meta_pricing` from `ApplicationSetting`), `cost_inr`; on retriable error (408/429/5xx): let BullMQ retry with exponential backoff; on non-retriable (invalid number, suspended): set `delivery_status = UNDELIVERABLE`, no retry
    - Apply BullMQ rate limiter `{ max: META_MESSAGES_PER_SECOND, duration: 1000 }`
    - _Requirements: 6.5, 6.6, 6.9, 9.4, 9.5, 9.9_

  - [ ] 12.5 Campaign pause, resume, and cancel
    - `pause(id)` â€” call `queue.pause()` on campaign queue, transition â†’ PAUSED, write state transition; `resume(id)` â€” `queue.resume()`, transition â†’ EXECUTING; `cancel(id, operatorId)` â€” `queue.obliterate({ force: false })` to drain unprocessed jobs, transition â†’ CANCELLED, record `cancelled_by_user_id`, write `AuditLog` CAMPAIGN_EXECUTE
    - `POST /api/v1/campaigns/:id/pause`, `POST /api/v1/campaigns/:id/resume`, `DELETE /api/v1/campaigns/:id`
    - _Requirements: 6.7, 6.8_

  - [ ] 12.6 Schedule campaign dispatch
    - `schedule(id, scheduledAtIst)` â€” convert IST datetime to UTC, store in `scheduled_at`, transition â†’ SCHEDULED; use BullMQ delayed job: `add(jobName, data, { delay: scheduledAt - now })` so job executes no earlier than scheduled UTC time; display IST to operators in all responses
    - `POST /api/v1/campaigns/:id/schedule`
    - _Requirements: 6.10_

---

### Phase 6: Backend â€” Webhooks & Analytics

- [ ] 13. Implement WebhooksModule
  - [ ] 13.1 HMAC signature verification and 5-second response guarantee
    - Create `apps/backend/src/webhooks/guards/meta-signature.guard.ts` exactly as in `design.md` security section â€” extracts raw body, computes `sha256=` + HMAC using `crypto.timingSafeEqual`, logs failed verifications to `AuditLog`
    - `GET /api/v1/webhooks/meta` â€” validate `hub.mode = subscribe`, compare `hub.verify_token` from env, return `hub.challenge`; never log verify token
    - `POST /api/v1/webhooks/meta` â€” apply `MetaSignatureGuard`; immediately INSERT `WebhookEvent` row with `status = PENDING` and raw payload; enqueue `webhook-processing` job; return HTTP 200 (all further processing is async); verify total time from receipt to 200 stays under 5s
    - _Requirements: 7.1, 7.2, 7.6, 7.7_

  - [ ] 13.2 Async webhook-processing worker
    - Create `apps/backend/src/webhooks/workers/webhook-processing.worker.ts`: parse event type from payload; for `message_status`: call `update_delivery_status_monotonic(meta_message_id, new_status, timestamp)` SQL function (monotonic guard, never regresses); update `mv_campaign_stats` refresh trigger; for `message_received`: check text against `opt_out_keywords` (case-insensitive exact-word regex per language from `ApplicationSetting`), if match trigger opt-out workflow via n8n webhook; mark `webhook_events.processing_status = PROCESSED`; on failure: set FAILED, enqueue retry with exponential backoff (initial 30s, factor 2, max 8 min); after 3 consecutive failures: alert Super_Admin
    - _Requirements: 7.3, 7.4, 7.5, 7.8_

- [ ] 14. Implement AnalyticsModule
  - [ ] 14.1 Campaign analytics and dashboard
    - Create `apps/backend/src/analytics/analytics.service.ts`: `getCampaignReport(id)` â€” query `mv_campaign_stats` by campaign_id, return all counters + rates; must complete < 500ms (covered by unique index `mv_campaign_stats_pk`); `getDashboard(range)` â€” aggregate query on `message_logs` indexed on `(campaign_id, delivery_status, dispatched_at)` returning total sent, delivery rate, read rate, failed rate, by-category breakdown, by-template breakdown, 90-day trend data; must return within 3s
    - `refreshCampaignStats(campaignId)` â€” called by webhook worker: `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_campaign_stats` (uses concurrent refresh to avoid lock)
    - `GET /api/v1/analytics/dashboard`, `GET /api/v1/analytics/campaigns/:id`
    - _Requirements: 11.1, 11.2, 11.3, 11.7, 11.8_

  - [ ] 14.2 Cost calculation and failure rate alerts
    - In `CampaignMessageWorker`: resolve `pricing_rate_inr` using `ApplicationSetting.meta_pricing` JSONB array â€” select entry with `MAX(effective_date) WHERE effective_date <= dispatch_time`; store rate on `MessageLog`
    - In webhook worker: after each batch, compute `failed_count / total_dispatched`; if > 0.10 call `AnalyticsService.sendFailureRateAlert(campaignId)` â€” send email via `nodemailer` to Admin user's profile email
    - _Requirements: 11.5, 11.6, 17.5_

  - [ ] 14.3 Async campaign report export
    - Create `apps/backend/src/analytics/workers/campaign-export.worker.ts` consuming `campaign-report-export` queue: query `MessageLog` for campaign, generate CSV via `csv-stringify` and PDF via `jsPDF`; upload both to R2; deliver 15-min presigned URLs via notification; fail with notification if not complete within 60s
    - `POST /api/v1/analytics/campaigns/:id/export`, `GET /api/v1/analytics/campaigns/:id/export/:jobId`
    - _Requirements: 11.4_

---

### Phase 7: Backend â€” Automation & n8n

- [ ] 15. Implement AutomationModule and internal API
  - [ ] 15.1 Automation rule CRUD and n8n registration
    - Create `apps/backend/src/automation/automation.service.ts`: `createRule(dto)` â€” INSERT `AutomationRule`; register workflow with n8n REST API `POST http://n8n:5678/api/v1/workflows` using internal n8n Basic Auth header; `updateRule(id, dto)` â€” update config and re-register workflow; `deactivate(id)` â€” set `status = INACTIVE`, deactivate in n8n
    - `missedExecutionCheck()` â€” called at app startup: compare `last_executed_at` vs `next_execute_at` for all ACTIVE rules; if `next_execute_at < now`, write missed execution log entry without retroactive dispatch
    - `GET /api/v1/automation/rules`, `POST /api/v1/automation/rules`, `PATCH /api/v1/automation/rules/:id`, `DELETE /api/v1/automation/rules/:id`, `GET /api/v1/automation/rules/:id/executions`
    - _Requirements: 8.8, 8.9, 8.10_

  - [ ] 15.2 Internal API endpoints consumed only by n8n
    - Create `apps/backend/src/automation/internal/internal-automation.controller.ts`; apply guard that checks `X-Internal-Api-Key` header against `INTERNAL_API_SECRET` env; block all requests from non-Docker-internal IPs
    - `POST /api/v1/internal/campaigns/:id/execute` â€” transition campaign â†’ EXECUTING, begin BullMQ job insertion
    - `POST /api/v1/internal/clients/:id/opt-out` â€” call `ConsentService.recordOptOut()` with `source = WHATSAPP_REPLY`, `operatorId = null` (SYSTEM)
    - `GET /api/v1/internal/automation/birthday-clients` â€” query clients where `date_of_birth` month+day = today IST, `account_status = ACTIVE`, `communication_consent = OPTED_IN`, no birthday message in current IST calendar year
    - `GET /api/v1/internal/automation/anniversary-clients` â€” same pattern for `wedding_anniversary`
    - `POST /api/v1/internal/automation/execution-error` â€” persist `AutomationExecution` failure record
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.7, 8.8_

  - [ ] 15.3 Write n8n workflow JSON files
    - Create `n8n/workflows/01-birthday-automation.json` â€” Cron trigger 03:30 UTC, HTTP Request to `GET /api/v1/internal/automation/birthday-clients`, IF `items.length > 0`, Split In Batches (size 50), HTTP Request `POST /api/v1/internal/campaigns/batch-enqueue` with `automationType: BIRTHDAY`, log execution result, Error Trigger node routing to Workflow 8
    - Create `n8n/workflows/02-anniversary-automation.json` â€” identical structure, `automationType: ANNIVERSARY`
    - Create `n8n/workflows/03-festival-dispatch.json` â€” Schedule node with dynamic date, fetch festival config, IF reminder vs dispatch, HTTP Request to execute campaign
    - Create `n8n/workflows/04-campaign-execution.json` â€” Webhook trigger `POST /webhook/campaign-execute`, validate campaign, enqueue recipients
    - Create `n8n/workflows/05-delivery-status.json` â€” Webhook, Switch by event_type, update status, refresh analytics
    - Create `n8n/workflows/06-opt-out.json` â€” Webhook, record opt-out, cancel in-flight jobs, DLQ on failure
    - Create `n8n/workflows/07-template-quality.json` â€” Cron 02:00 UTC, fetch approved templates, batch-query Meta quality, update DB, alert on RED
    - Create `n8n/workflows/08-error-handler.json` â€” Webhook, persist error, alert notification channel, capture to Sentry
    - All workflows use `X-Internal-Api-Key` credential stored as n8n environment variable
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.11_

---

### Phase 8: Backend â€” Infrastructure Jobs, Health & Settings

- [ ] 16. Implement HealthModule and SettingsModule
  - [ ] 16.1 Health endpoint
    - Create `apps/backend/src/health/health.controller.ts`: `GET /api/v1/health` â€” no auth required; run `prisma.$queryRaw(sql\`SELECT 1\`)` with latency measurement; run `redis.ping()` with latency; run `fetch(http://n8n:5678/healthz)` (internal); if 2 consecutive DB pings fail, set `status = degraded` and return HTTP 503 on all data endpoints; alert Super_Admin within 2 min; response body includes `service`, `version` from `package.json`, `status`, `database.{status, latency_ms}`, `redis.{status, latency_ms}`, ISO timestamp
    - _Requirements: 14.2, 14.3_

  - [ ] 16.2 Application settings with hot-reload
    - Create `apps/backend/src/settings/settings.service.ts`: cache all settings in `Map<string, ConfigValue>` on startup; subscribe to PostgreSQL `LISTEN settings_changed` via `pg_notify` trigger (use `PrismaService.$on('query')` or raw `pg` client); on notification invalidate cache key and reload from DB; `update(key, value)` â€” Zod-validate value per key schema (webhook URL regex, ISO-639-1 enum, positive integer), UPDATE `ApplicationSetting`, write `AuditLog` SETTINGS_CHANGE
    - `GET /api/v1/settings`, `PATCH /api/v1/settings` (Super_Admin only)
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

- [ ] 17. Infrastructure scheduled workers
  - [ ] 17.1 Database backup worker
    - Create `apps/backend/src/scheduler/workers/db-backup.worker.ts` consuming `db-backup` repeatable queue (daily): spawn `pg_dump ${DATABASE_URL} | gzip` via Node `child_process.exec`, upload gzipped dump to R2 at key `backups/db/{UTC_DATE}_{schema_version}.sql.gz`; retain 30 days (cleanup old keys); alert Super_Admin on failure
    - Register repeatable job with `{ pattern: '0 2 * * *' }` UTC
    - _Requirements: 14.4_

  - [ ] 17.2 Retention cleanup worker
    - Create `apps/backend/src/scheduler/workers/retention-cleanup.worker.ts` consuming `retention-cleanup` repeatable queue (nightly): anonymize `Client` records where `deleted_at < NOW() - INTERVAL '7 years'`; anonymize `MessageLog` records older than 5 years; use `ClientsService.erase()` for each; if job fails, alert Super_Admin within 1 hour
    - _Requirements: 15.7_

  - [ ] 17.3 Audit archive worker and media purge worker
    - Create `apps/backend/src/audit/workers/audit-archive.worker.ts` consuming `audit-archive` repeatable queue (monthly): SELECT `audit_logs WHERE created_at < NOW() - INTERVAL '1 year'`, serialize to NDJSON, gzip, upload to R2 `audit-archive/{year}/{month}.ndjson.gz`, DELETE original rows
    - Create `apps/backend/src/media/workers/r2-purge.worker.ts` (runs as part of `retention-cleanup`): DELETE R2 objects where `media_assets.r2_purge_at < NOW()`; DELETE `MediaAsset` rows; run `DELETE FROM webhook_events WHERE expires_at < NOW() AND processing_status = 'PROCESSED'`
    - _Requirements: 12.3, 10.5_

  - [ ] 17.4 WABA quality polling and Sentry configuration
    - Create `apps/backend/src/settings/workers/waba-quality.worker.ts` consuming repeatable queue (every 6h): call Meta Business Management API `GET /v20.0/{META_WABA_ID}?fields=health_status`; if quality = RED, pause all Marketing campaigns (`WHERE status = EXECUTING OR status = SCHEDULED AND template.category = MARKETING`), alert Super_Admin; retry after 15 min on failure; alert if 3 consecutive failures
    - In `apps/backend/src/main.ts`: initialise `Sentry.init({ dsn: SENTRY_DSN_BACKEND, beforeSend: scrubPiiFromEvent })` where `scrubPiiFromEvent` strips phone numbers (`/\+\d{10,15}/g`), email addresses, full names matching Client records
    - _Requirements: 15.5, 14.8, 13.10_

---

### Phase 9: Frontend â€” Foundation & Auth

- [ ] 18. Scaffold frontend application
  - [ ] 18.1 Initialise Vite + React 18 + TypeScript
    - Run `npm create vite@latest frontend -- --template react-ts` inside `apps/`
    - Install: `tailwindcss@3`, `postcss`, `autoprefixer`, `@tailwindcss/forms`, `shadcn-ui`, `@tanstack/react-query@5`, `@tanstack/react-router`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`, `axios`, `date-fns`, `recharts`, `@sentry/react`, `lucide-react`
    - Run `npx tailwindcss init -p` and configure `tailwind.config.ts` with content paths
    - Run `npx shadcn-ui@latest init` selecting Slate color scheme
    - Set `apps/frontend/tsconfig.json` to extend `../../tsconfig.base.json` with `strict: true`
    - _Requirements: all frontend_

  - [ ] 18.2 Set up TanStack Router and protected route layout
    - Create `apps/frontend/src/router.tsx` with TanStack Router file-based routing
    - Create `apps/frontend/src/routes/__root.tsx` with `AppShell` layout
    - Create `apps/frontend/src/routes/auth/login.tsx`
    - Create `apps/frontend/src/components/PrivateLayout.tsx` â€” checks `useAuthStore().isAuthenticated`, redirects to `/auth/login` if false
    - Create all page stub files for every route in the page structure from `design.md`
    - _Requirements: 2.3_

  - [ ] 18.3 Zustand auth store and Axios interceptors
    - Create `apps/frontend/src/stores/auth.store.ts` with `AuthStore` interface: `user`, `accessToken` (in memory only, never localStorage), `isAuthenticated`; `setUser`, `clearSession`, `setAccessToken`
    - Create `apps/frontend/src/lib/api-client.ts` matching the axios config from `design.md`: request interceptor attaches `Authorization: Bearer {accessToken}` from memory; response interceptor silently refreshes on 401 by calling `POST /api/v1/auth/refresh` (refresh token in httpOnly cookie), retries original request; on second 401 calls `clearSession()` and redirects to login
    - _Requirements: 1.3, 1.7_

- [ ] 19. Build Login page and TOTP flow
  - [ ] 19.1 Login form with lockout and TOTP step
    - Create `apps/frontend/src/routes/auth/login.tsx` using React Hook Form + Zod schema (`email: z.string().email()`, `password: z.string().min(1)`)
    - On API 401 with body `{ code: 'account_locked' }`, display lockout message prompting Admin contact
    - On response `{ mfa_required: true }`, transition to TOTP input step showing a 6-digit numeric input field
    - On success, call `setUser()` and `setAccessToken()`, navigate to `/dashboard`
    - _Requirements: 1.1, 1.2, 1.9_

  - [ ] 19.2 Role-based navigation sidebar
    - Create `apps/frontend/src/components/SideNav.tsx`: render navigation links filtered by `useAuthStore().user.role`; Viewer sees only Analytics + Campaigns (read); Marketing_Employee adds Templates + Campaigns (create); Operator adds Clients (read); Admin adds all management; Super_Admin adds Settings + Audit Log + User Management
    - Apply `lucide-react` icons for each nav item
    - _Requirements: 2.1, 2.3_

---

### Phase 10: Frontend â€” Dashboard & Client Management

- [ ] 20. Dashboard and client list pages
  - [ ] 20.1 Dashboard stats page
    - Create `apps/frontend/src/routes/dashboard/index.tsx`: use TanStack Query `useQuery({ queryKey: ['dashboard'], queryFn: () => apiClient.get('/analytics/dashboard'), staleTime: 30_000 })`; render stat cards for total sent, delivery rate, read rate, failed rate; Recharts `LineChart` for 7-day trend; Recharts `BarChart` for by-category breakdown; handle loading and error states with shadcn Skeleton and Alert components
    - _Requirements: 11.3_

  - [ ] 20.2 Clients list with server-side pagination and filter
    - Create `apps/frontend/src/routes/clients/index.tsx` using TanStack Table with server-side pagination: columns for name, WhatsApp number, category, consent status, account status, created at; search input debounced 300ms; filter dropdowns for category_tier, consent status, account status, language; `useQuery` with `queryKey: ['clients', filters, page]`; bulk action to trigger export
    - _Requirements: 3.7, 3.8, 3.9_

  - [ ] 20.3 Client create/edit form modal
    - Create `apps/frontend/src/components/clients/ClientFormModal.tsx` using React Hook Form + Zod schema validating all fields (E.164 phone via `libphonenumber-js` on client side, ISO 639-1 language, ISO 8601 dates); `useMutation` with optimistic cache invalidation on `['clients']` query key
    - _Requirements: 3.1, 3.2_

  - [ ] 20.4 CSV import UI
    - Create `apps/frontend/src/routes/clients/import.tsx`: drag-and-drop file upload zone (shadcn); on file select, POST to `/api/v1/clients/import` as `multipart/form-data`; poll `GET /api/v1/clients/import/:jobId` every 2s; on completion, show imported count; on error, render table of `{ line, field, message }` errors with line numbers highlighted
    - _Requirements: 3.5_

  - [ ] 20.5 Client detail panel with consent and message history
    - Create `apps/frontend/src/routes/clients/[id].tsx`: render `ClientProfileCard` (all fields, edit button for Admin+), `ConsentHistoryTimeline` (chronological consent records with source badges), `MessageHistoryTable` (server-paginated page size 25, ordered by `dispatched_at` DESC, columns: template name, status badge, sent at, delivered at, read at)
    - Manual opt-out form (requires `reason` field, 1â€“500 chars) and opt-in button with confirmation dialog
    - DPDP erasure button for Admin+ â€” confirmation dialog stating irreversibility
    - _Requirements: 3.9, 4.5, 15.2_

---

### Phase 11: Frontend â€” Templates & Campaigns

- [ ] 21. Templates pages
  - [ ] 21.1 Template list and builder
    - Create `apps/frontend/src/routes/templates/index.tsx`: list with status badge (Draft/Pending/Approved/Rejected), quality rating colour indicator (Green/Yellow/Red dot), `created_at`, `category`; filter by status and category; buttons for Create, Submit to Meta, New Version
    - Create `apps/frontend/src/routes/templates/new.tsx` and `[id].tsx`: rich body textarea that highlights `{{1}}`, `{{2}}` syntax; dynamic variable definition table (name, data source dropdown: Client field / Campaign field / Static); header type selector with optional media upload zone (uses `MediaModule` presigned URL flow); footer text; interactive button builder (up to 3 buttons); validation feedback for unmatched placeholders
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ] 21.2 Template live preview panel
    - Create `apps/frontend/src/components/templates/LivePreviewPanel.tsx`: Client search typeahead to select a sample Client; on selection, call `GET /api/v1/templates/:id/preview?clientId={id}` and render resulting body/header/footer in a WhatsApp-styled message bubble mockup; update on every body edit with 500ms debounce
    - _Requirements: 5.7_

- [ ] 22. Campaign wizard and report page
  - [ ] 22.1 Campaign creation 5-step wizard
    - Create `apps/frontend/src/routes/campaigns/new.tsx` with step state machine (URL-persisted via TanStack Router search params):
      - Step 1 (Details): name, type, description â€” React Hook Form validation
      - Step 2 (Audience): segment filter builder (category tier multi-select, consent status, language, date range sliders); live count badge that re-queries `POST /api/v1/campaigns/:id/resolve-audience` on filter change with 1s debounce
      - Step 3 (Template): template selector showing only `APPROVED` templates; live preview of selected template with sample data
      - Step 4 (Schedule): IST datetime picker (using `date-fns` with `Asia/Kolkata` timezone); "Send now" toggle
      - Step 5 (Confirm): summary showing resolved recipient count, template preview, estimated cost (pre-GST + post-GST at 18%), category, dispatch time in IST; explicit "Confirm & Dispatch" button
    - _Requirements: 6.1, 6.2, 6.3, 6.10_

  - [ ] 22.2 Campaign list and detail/report page
    - Create `apps/frontend/src/routes/campaigns/index.tsx`: TanStack Table with status filter tabs (All / Draft / Pending / Executing / Completed / Paused / Cancelled); each row links to detail page; Approve/Reject buttons visible for Admin on PENDING rows
    - Create `apps/frontend/src/routes/campaigns/[id].tsx`: live stats cards (sent, delivered, read, failed, suppressed, cost); Recharts `AreaChart` for delivery timeline; `MessageLogTable` (paginated, sortable, filterable by delivery_status); action buttons (Pause/Resume/Cancel/Export); rejection reason field for reject action (min 10 chars)
    - For campaigns in `EXECUTING` status, set `refetchInterval: 5000` on the stats query
    - _Requirements: 6.12, 16.3_

---

### Phase 12: Frontend â€” Analytics, Audit Log & Settings

- [ ] 23. Analytics dashboard page
  - Create `apps/frontend/src/routes/analytics/index.tsx`: date range picker defaulting to last 30 days; stat cards for total sent/delivered/read/failed all-time and within range; Recharts `LineChart` for 90-day daily trend (3 series: sent, delivered, read); Recharts `BarChart` for by-template breakdown; Recharts `PieChart` for MARKETING / UTILITY / AUTHENTICATION split; cost breakdown table (cost by category, by campaign); `Window focus refetch` disabled; Export button triggering async CSV export
  - _Requirements: 11.3, 11.6_

- [ ] 24. Audit log page
  - Create `apps/frontend/src/routes/audit/index.tsx`: server-side paginated table (500/page) with filter controls for `actor_id` (user typeahead), `action_type` (multi-select enum), `resource_type` (text input), `resource_id` (UUID input), date range, IP address; inline `before_state` / `after_state` JSON diff viewer (expandable row); only visible to Admin+
  - _Requirements: 12.4, 12.6_

- [ ] 25. Settings pages
  - [ ] 25.1 User management sub-page
    - Create `apps/frontend/src/routes/settings/users.tsx`: list all Operators with role badges; Create Operator modal (email, fullName, role, temporary password); Change Role dropdown with confirmation dialog; Unlock button on LOCKED accounts; Soft delete with confirmation
    - _Requirements: 2.1, 2.5_

  - [ ] 25.2 Application settings sub-pages
    - Create `apps/frontend/src/routes/settings/index.tsx` with tabs:
      - **Pricing**: table of `meta_pricing` entries (category, rate_inr, effective_date); add row form with future-date picker
      - **Opt-out Keywords**: per-language keyword list (add/remove)
      - **Festival Calendar**: list of festival entries (name, dispatch_date, reminder_date, segment, template); CRUD form
      - **Notification Channels**: email and webhook URL configuration
      - **Birthday/Anniversary Templates**: dropdown to select approved template for each automation type
    - All fields validated with Zod, `useMutation` with optimistic updates
    - Visible to Super_Admin only (gate with role check and 403 redirect otherwise)
    - _Requirements: 17.1, 17.2, 17.3_

  - [ ] 25.3 Privacy Centre UI
    - Create `apps/frontend/src/routes/privacy-centre/[token].tsx`: validate time-limited token (backend issues via `POST /api/v1/clients/:id/privacy-centre-link`, expires 24h); display Client's own data, consent history, message history; action buttons for DPDP rights: access (download JSON), correction (edit form), erasure (with confirmation), consent withdrawal; all actions call backend endpoints with token auth
    - _Requirements: 15.9_

---

### Phase 13: Production Deployment & Security Hardening

- [ ] 26. Nginx and TLS configuration
  - [ ] 26.1 Write production Nginx config
    - Create `nginx/nginx.prod.conf` exactly matching `design.md` infrastructure section: rate limit zones (`unauth:10m rate=20r/m`, `auth:10m rate=100r/m`); Meta webhook IP allowlist `geo $meta_webhook_allowed` block with all Meta published CIDR ranges; `server` block on port 80 for ACME challenge + HTTP 301 redirect; `server` block on port 443 with TLS 1.2/1.3, SSL session cache; proxy locations for `/api/v1/`, `/api/v1/webhooks/meta` (IP-restricted), `/n8n/` (internal Docker network only), `/api/v1/health`, `/api/v1/auth/`; all HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers on 443 server block
    - _Requirements: 13.1, 13.4, 13.11, 14.10_

  - [ ] 26.2 Let's Encrypt SSL auto-renewal
    - Certbot container in `docker-compose.prod.yml` runs the 12h renewal loop via entrypoint script `certbot renew --webroot -w /var/www/certbot`; Nginx uses webroot at `/var/www/certbot` for ACME challenges; volume `letsencrypt-certs` shared between Nginx and Certbot containers
    - Initial cert issuance: `docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d ${DOMAIN}`
    - _Requirements: 13.1_

- [ ] 27. CI/CD pipelines and final deployment
  - [ ] 27.1 GitHub Actions workflow for backend
    - Create `.github/workflows/backend.yml`: on push to `main`, run `npm ci`, `npx prisma generate`, `npm run lint`, `npm test -- --ci`, `npm run build`; if all pass, trigger Render deploy hook via `curl ${RENDER_DEPLOY_HOOK_URL}`
    - _Requirements: 14.5_

  - [ ] 27.2 Vercel project setup for frontend
    - Create `apps/frontend/vercel.json` with `builds: [{ src: "package.json", use: "@vercel/static-build" }]` and `routes` SPA fallback
    - Set Vercel environment variables: `VITE_API_BASE_URL`, `VITE_SENTRY_DSN_FRONTEND`
    - Configure custom domain in Vercel dashboard; enable auto-deploy from GitHub `main` branch
    - _Requirements: 14.5_

  - [ ] 27.3 Render service setup
    - Create `render.yaml` as in `design.md` infrastructure section: `wt-whatsapp-backend` web service (Docker, standard plan, Singapore region), `wt-redis` Redis service (starter, Singapore), `wt-postgres` PostgreSQL database (starter, v15, Singapore)
    - Configure `envVars.fromGroup: wt-whatsapp-secrets` for all backend env vars
    - Verify `healthCheckPath: /api/v1/health` is set
    - _Requirements: 14.1, 14.6_

  - [ ] 27.4 Production smoke test
    - After deployment: call `GET /api/v1/health` â†’ verify 200 and `status: healthy`; create a test Client via API; create an approved Template; create and dispatch a 1-recipient test Campaign; verify `MessageLog.delivery_status` advances to `DELIVERED` after Meta webhook arrives; verify `AuditLog` has entries for every step; run `GET /api/v1/analytics/dashboard` and verify non-zero metrics
    - _Requirements: all_

---

### Phase 14: Testing

- [ ] 28. Unit tests for critical business logic
  - [ ] 28.1 AuthModule guard unit tests
    - Create `apps/backend/src/auth/guards/__tests__/jwt-auth.guard.spec.ts`: mock `PrismaService` and `Redis`; test: valid token passes guard; expired token returns 401; JTI in denylist returns 401; last activity > 60 min returns 401; 5 consecutive failed logins lock account; correct credentials after < 5 failures resets counter
    - _Requirements: 1.1, 1.2, 1.7_

  - [ ]* 28.2 ConsentModule suppression unit tests
    - Create `apps/backend/src/consent/__tests__/consent.service.spec.ts`: test: `recordOptOut()` creates new row, never updates existing; `getCurrentStatus()` returns most recent by `recorded_at`; campaign audience resolution excludes OPTED_OUT and PENDING clients for MARKETING category
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 28.3 Campaign idempotency unit tests
    - Create `apps/backend/src/campaigns/__tests__/idempotency.spec.ts`: test: `generateIdempotencyKey(campaignId, clientId, executionId)` always returns same 64-char hex string for same inputs; different inputs return different keys; second `enqueue()` call with same key is rejected before BullMQ insertion
    - _Requirements: 6.4, 6.11, 9.7_

  - [ ]* 28.4 Delivery status monotonicity unit tests
    - Create `apps/backend/src/webhooks/__tests__/monotonic-status.spec.ts`: test: status advances QUEUEDâ†’SENTâ†’DELIVEREDâ†’READ; incoming status equal to current is a no-op; incoming status earlier than current is a no-op; FAILED and UNDELIVERABLE behave as terminal states
    - _Requirements: 7.5_

- [ ] 29. Integration tests
  - [ ]* 29.1 Full campaign dispatch integration test
    - Create `apps/backend/test/integration/campaign-dispatch.spec.ts` using Testcontainers (real PostgreSQL 15 + Redis 7); seed a Campaign with 10 recipients; call `dispatch(id)`; verify 10 `CampaignRecipient` rows inserted; verify 10 `MessageLog` rows with status `QUEUED`; mock Meta API returning 200; verify Meta was called 10 times; simulate 10 delivery webhooks; verify all `MessageLog.delivery_status = DELIVERED`; verify `mv_campaign_stats` delivery count = 10
    - _Requirements: 6.4, 6.5, 7.3_

  - [ ]* 29.2 Opt-out flow integration test
    - Create `apps/backend/test/integration/opt-out.spec.ts`: seed opted-in Client; enqueue 5 campaign jobs; send opt-out webhook event with `STOP` keyword; verify `WhatsappConsent` row inserted with `OPTED_OUT`; verify remaining queued jobs suppressed; verify new campaign dispatch excludes this Client; verify opt-out completes within 60s
    - _Requirements: 4.4, 4.9, 8.7_

  - [ ]* 29.3 Webhook processing integration test
    - Create `apps/backend/test/integration/webhook-processing.spec.ts`: POST valid HMAC-signed webhook payload; verify HTTP 200 within 5s; verify `WebhookEvent` row created; verify `MessageLog.delivery_status` updated; POST same payload twice; verify no duplicate `WebhookEvent` rows; verify `MessageLog` unchanged after duplicate
    - _Requirements: 7.1, 7.2, 7.3, 7.7_

- [ ] 30. Property-based tests (fast-check)
  - [ ]* 30.1 P1 â€” Consent Filter Invariant property test
    - Create `apps/backend/src/campaigns/__tests__/pbt/p1-consent-filter.pbt.spec.ts`
    - **Property 1: Consent Filter Invariant**
    - **Validates: Requirements 4.3, 4.6, 4.9, 15.3**
    - Use `fc.array(fc.record({ clientId: fc.uuid(), consentStatus: fc.constantFrom('OPTED_OUT', 'PENDING', 'OPTED_IN') }), { minLength: 1, maxLength: 100 })`; call `resolveAudienceForMarketing(clients)`; assert every returned client has `consentStatus === 'OPTED_IN'`; run with `numRuns: 500`

  - [ ]* 30.2 P2 â€” Idempotency Invariant property test
    - Create `apps/backend/src/campaigns/__tests__/pbt/p2-idempotency.pbt.spec.ts`
    - **Property 2: Idempotency Key Uniqueness**
    - **Validates: Requirements 6.4, 6.11, 9.7**
    - Two sub-tests: (a) same `(campaignId, clientId, executionId)` always produces the same 64-char SHA-256 hex key â€” `numRuns: 500`; (b) `fc.uniqueArray(fc.tuple(fc.uuid(), fc.uuid(), fc.uuid()), { minLength: 2, maxLength: 10 })` â†’ all generated keys are distinct â€” `numRuns: 100`

  - [ ]* 30.3 P3 â€” Delivery Status Monotonicity property test
    - Create `apps/backend/src/webhooks/__tests__/pbt/p3-status-monotonicity.pbt.spec.ts`
    - **Property 3: Delivery Status Monotonicity**
    - **Validates: Requirements 7.3, 7.5**
    - Arbitraries: `fc.integer({ min: 0, max: 3 })` for current and incoming index into `['QUEUED', 'SENT', 'DELIVERED', 'READ']`; call `applyMonotonicStatusUpdate(current, incoming)`; assert `deliveryStatusOrdinal(result) >= deliveryStatusOrdinal(current)`; `numRuns: 500`

  - [ ]* 30.4 P4 â€” Audit Log Append-Only property test
    - Create `apps/backend/src/audit/__tests__/pbt/p4-audit-append-only.pbt.spec.ts`
    - **Property 4: Audit Log Append-Only**
    - **Validates: Requirements 12.2**
    - Using Testcontainers with real PostgreSQL and RLS enabled: `fc.array(fc.record({ actionType: fc.constantFrom(...AuditActionTypes), resourceType: fc.string() }), { minLength: 1, maxLength: 20 })`; insert all entries; attempt `UPDATE audit_logs SET action_type = 'CREATE' WHERE id = $1`; assert it throws (RLS block); assert row count monotonically non-decreasing after each insert; `numRuns: 100`

  - [ ]* 30.5 P5 â€” Soft Delete Exclusion property test
    - Create `apps/backend/src/clients/__tests__/pbt/p5-soft-delete-exclusion.pbt.spec.ts`
    - **Property 5: Soft Delete Exclusion**
    - **Validates: Requirements 3.4**
    - `fc.array(fc.record({ clientId: fc.uuid(), deletedAt: fc.option(fc.date()), consentStatus: fc.constantFrom('OPTED_IN', 'OPTED_OUT', 'PENDING') }), { minLength: 1, maxLength: 50 })`; call `buildCampaignRecipients(clients, dispatchAt)`; assert no returned recipient has `deletedAt !== null && deletedAt < dispatchAt`; `numRuns: 500`

  - [ ]* 30.6 P6 â€” Template Variable Round-Trip Completeness property test
    - Create `apps/backend/src/templates/__tests__/pbt/p6-variable-completeness.pbt.spec.ts`
    - **Property 6: Template Variable Round-Trip Completeness**
    - **Validates: Requirements 5.2, 5.6, 6.5**
    - `fc.integer({ min: 0, max: 10 }).chain(n => fc.tuple(fc.constant(n), fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: n, maxLength: n })))`; build template body as `Array.from({ length: n }, (_, i) => \`{{\${i + 1}}}\`).join(' ')`; call `renderTemplate(body, variableMap)`; assert `!/\{\{\d+\}\}/.test(rendered)`; `numRuns: 500`

  - [ ]* 30.7 P7 â€” Webhook Idempotency property test
    - Create `apps/backend/src/webhooks/__tests__/pbt/p7-webhook-idempotency.pbt.spec.ts`
    - **Property 7: Webhook Idempotency**
    - **Validates: Requirements 7.3, 7.7**
    - `fc.record({ metaMessageId: fc.string({ minLength: 10, maxLength: 36 }), status: fc.constantFrom('sent', 'delivered', 'read', 'failed') })`; call `processWebhookEvent(payload)` twice with identical payload; assert `MessageLog` count for that `meta_message_id` = 1; assert `final delivery_status` same both times; assert no duplicate `WebhookEvent` rows; `numRuns: 200`

  - [ ]* 30.8 P8 â€” Cost Calculation Accuracy property test
    - Create `apps/backend/src/analytics/__tests__/pbt/p8-cost-accuracy.pbt.spec.ts`
    - **Property 8: Cost Calculation Accuracy**
    - **Validates: Requirements 11.6, 17.5**
    - Generate `fc.array(fc.record({ effective_date: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }), rate_inr: fc.float({ min: 0.01, max: 10 }) }), { minLength: 1, maxLength: 10 })` as pricing table; generate `dispatchAt: fc.date()`; call `resolvePricingRate(pricingTable, 'MARKETING', dispatchAt)`; assert result equals max rate entry where `effective_date <= dispatchAt`; also assert `sumMessageCosts(messageLogs, campaignId) === campaign.actual_cost_inr`; `numRuns: 500`

- [ ] 31. Performance tests
  - [ ]* 31.1 Search performance test
    - Create `apps/backend/test/performance/client-search.perf.spec.ts`: seed 100,000 Client rows using Prisma `createMany` batched in 1,000-row chunks; run `GET /api/v1/clients?q=sharma` 50 times; compute P95 response time; assert P95 < 500ms; this test requires the GIN index to be present and verifies Requirement 3.7
    - _Requirements: 3.7_

  - [ ]* 31.2 Campaign report query performance test
    - Create `apps/backend/test/performance/campaign-report.perf.spec.ts`: seed 50,000 `MessageLog` rows for one campaign; call `GET /api/v1/analytics/campaigns/:id` 20 times after `REFRESH MATERIALIZED VIEW mv_campaign_stats`; assert all responses < 500ms; verifies Requirement 11.2
    - _Requirements: 11.2_

---

## Notes

- Tasks marked `*` are optional and can be skipped for a faster MVP delivery.
- Core implementation tasks (unmarked) must be completed in order within each phase.
- Each phase can begin once all tasks in the preceding phase are complete.
- Property tests (Phase 14) can be developed in parallel with their corresponding backend phases once the utility functions they test are implemented.
- All secrets must be provided via environment variables. Never hardcode credentials.
- The Prisma migration files in `0001_supplements.sql` and `0002_campaign_stats_view.sql` must be applied after the initial `prisma migrate deploy` by wrapping them in a Prisma custom migration (use `prisma migrate dev --create-only` to create an empty migration, then paste the SQL).
- n8n workflow JSON files must be imported manually into the n8n instance via the n8n UI or the n8n REST API on first deployment.
- The `Client.communicationConsent` field is a denormalized cache of the latest consent status and must be updated atomically in the same transaction as every `WhatsappConsent` insert — see the design.md data models note.
- Checkpoints: after Phase 2, after Phase 5, after Phase 8, after Phase 12 â€” run all tests to verify no regressions before proceeding.

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["5.1", "5.2"] },
    { "id": 6, "tasks": ["5.3", "5.4"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 8, "tasks": ["7.1", "7.2"] },
    { "id": 9, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 10, "tasks": ["8.1", "8.2"] },
    { "id": 11, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 12, "tasks": ["10.1", "10.2"] },
    { "id": 13, "tasks": ["11.1"] },
    { "id": 14, "tasks": ["12.1"] },
    { "id": 15, "tasks": ["12.2", "12.5", "12.6"] },
    { "id": 16, "tasks": ["12.3"] },
    { "id": 17, "tasks": ["12.4"] },
    { "id": 18, "tasks": ["13.1", "13.2"] },
    { "id": 19, "tasks": ["14.1", "14.2"] },
    { "id": 20, "tasks": ["14.3"] },
    { "id": 21, "tasks": ["15.1", "15.2"] },
    { "id": 22, "tasks": ["15.3"] },
    { "id": 23, "tasks": ["16.1", "16.2"] },
    { "id": 24, "tasks": ["17.1", "17.2", "17.3"] },
    { "id": 25, "tasks": ["17.4"] },
    { "id": 26, "tasks": ["18.1"] },
    { "id": 27, "tasks": ["18.2", "18.3"] },
    { "id": 28, "tasks": ["19.1", "19.2"] },
    { "id": 29, "tasks": ["20.1", "20.2"] },
    { "id": 30, "tasks": ["20.3", "20.4", "20.5"] },
    { "id": 31, "tasks": ["21.1", "21.2"] },
    { "id": 32, "tasks": ["22.1", "22.2"] },
    { "id": 33, "tasks": ["23"] },
    { "id": 34, "tasks": ["24"] },
    { "id": 35, "tasks": ["25.1", "25.2", "25.3"] },
    { "id": 36, "tasks": ["26.1", "26.2"] },
    { "id": 37, "tasks": ["27.1", "27.2", "27.3"] },
    { "id": 38, "tasks": ["27.4"] },
    { "id": 39, "tasks": ["28.1", "28.2", "28.3", "28.4"] },
    { "id": 40, "tasks": ["29.1", "29.2", "29.3"] },
    { "id": 41, "tasks": ["30.1", "30.2", "30.3", "30.4", "30.5", "30.6", "30.7", "30.8"] },
    { "id": 42, "tasks": ["31.1", "31.2"] }
  ]
}
```
