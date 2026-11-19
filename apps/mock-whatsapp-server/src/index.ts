import dotenv from 'dotenv';
import path from 'path';

// Load backend .env for consistent META_APP_SECRET and port settings
dotenv.config({ path: path.join(__dirname, '../../backend/.env') });
dotenv.config(); // Also check local .env if present

import express from 'express';
import { graphRouter } from './graph-router';
import { adminRouter } from './admin-router';

const app = express();
const PORT = process.env.MOCK_SERVER_PORT ? parseInt(process.env.MOCK_SERVER_PORT, 10) : 4010;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Hub-Signature-256');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON Body Parser with raw body retention
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Meta WhatsApp Cloud API Virtualization Server',
    version: '20.0',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'Wealth Transformers Meta WhatsApp Cloud API Virtualization Mock',
    mode: 'SIT_SERVICE_VIRTUALIZATION',
    docs: '/admin/traces',
  });
});

// Mount Routers
app.use('/admin', adminRouter);
app.use('/', graphRouter);

const server = app.listen(PORT, () => {
  console.log(`[MockWhatsAppServer] 🌐 Meta Cloud API Simulator listening on port ${PORT}`);
  console.log(`[MockWhatsAppServer] 📡 Webhook target: ${process.env.SUT_WEBHOOK_URL || 'http://localhost:3000/api/v1/webhooks/meta'}`);
});

export { app, server };
