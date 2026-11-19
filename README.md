# Wealth Trade Stock Market — WhatsApp Business Automation Platform

A production-grade customer engagement and WhatsApp communication automation platform for **Wealth Trade Stock Market**, built with NestJS, React, PostgreSQL, Prisma, Redis, BullMQ, n8n, and the official Meta WhatsApp Business Cloud API.

---

## Overview

The platform automates customer communications throughout the customer lifecycle:
- 🎂 **Automated Birthday Wishes**: Scheduled daily greetings matching Asia/Kolkata (`UTC+05:30`) dates with annual deduplication.
- 💍 **Automated Anniversary Greetings**: Annual wedding anniversary communications with independent idempotency keys.
- 🪔 **Festival Campaign Dispatch**: Calendar-scheduled holiday and festival broadcasts with operator approval gates.
- 📈 **Promotional Campaigns**: Segmented broadcast messaging with statutory SEBI/AMFI compliance validation.
- 🛑 **Instant Opt-Out Engine**: Inbound keyword processing (`STOP`, `UNSUBSCRIBE`, `ROKO`) with Redis suppression and immutable PostgreSQL audit logs.
- 📊 **Role-Based Dashboards**: Real-time analytics, queue monitoring, and multi-tier operational views (Super Admin, Admin, Marketing, Operator, Viewer).

---

## Architecture Stack

| Subsystem | Technology | Purpose |
|---|---|---|
| **Backend API** | NestJS 10.3 + TypeScript | Core REST API, authentication, RBAC, business logic |
| **Frontend UI** | React 18 + Vite + TailwindCSS | Operator and management dashboards |
| **Database** | PostgreSQL 15 + Prisma 5.11 | Client records, message logs, campaigns, templates |
| **Queue & Worker** | Redis 7 + BullMQ 5.4 | Outbound message queuing, retry backoff, concurrency control |
| **Automation** | n8n Community Edition | Workflow orchestration, cron schedules, keyword triggers |
| **External Messaging** | Meta WhatsApp Cloud API (v20.0+) | Official message dispatch and webhook delivery tracking |
| **Reverse Proxy** | Nginx Alpine + Certbot | TLS termination, rate limiting, and webhook routing |

---

## Getting Started

### Prerequisites
- Node.js >= 20.0
- Docker & Docker Compose
- PostgreSQL 15 & Redis 7

### Local Development Setup

1. **Clone repository**:
   ```bash
   git clone https://github.com/samasif582-spec/wealth_transformers_india.git
   cd wealth_transformers_india
   ```

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Configure database, Redis, and Meta credentials in .env
   ```

3. **Start Infrastructure Containers**:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

4. **Install Dependencies & Seed Database**:
   ```bash
   npm install
   npx prisma db push --schema apps/backend/prisma/schema.prisma
   npm run seed --prefix apps/backend
   ```

5. **Run Applications**:
   ```bash
   # Terminal 1: Backend API (port 3000)
   npm run dev:backend

   # Terminal 2: Frontend Dashboard (port 5173)
   npm run dev:frontend
   ```

---

## Verification & Testing

```bash
# Run all backend unit and integration test suites
npm run test --prefix apps/backend
```

---

## License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.
