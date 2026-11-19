import { Router, Request, Response } from 'express';
import { store } from './store';
import { WebhookDispatcher } from './webhook-dispatcher';

export const adminRouter = Router();

// 1. Tenants
adminRouter.get('/tenants', (req: Request, res: Response) => {
  return res.status(200).json({ tenants: store.tenants });
});

adminRouter.post('/tenants', (req: Request, res: Response) => {
  const tenant = req.body;
  if (!tenant.id || !tenant.wabaId || !tenant.phoneNumberId) {
    return res.status(400).json({ error: 'Missing tenant fields' });
  }
  const existingIdx = store.tenants.findIndex((t) => t.id === tenant.id);
  if (existingIdx >= 0) {
    store.tenants[existingIdx] = { ...store.tenants[existingIdx], ...tenant };
  } else {
    store.tenants.push(tenant);
  }
  return res.status(200).json({ success: true, tenant });
});

// 2. Scenario Seeding & Reset
adminRouter.post('/scenarios/seed', (req: Request, res: Response) => {
  store.seedDefaultData();
  return res.status(200).json({
    success: true,
    message: 'Seeded default SIT virtual tenants and approved templates',
    tenantCount: store.tenants.length,
    templateCount: store.templates.length,
  });
});

adminRouter.post('/scenarios/reset', (req: Request, res: Response) => {
  store.reset();
  return res.status(200).json({
    success: true,
    message: 'Reset all simulated messages, traces, and restored initial state',
  });
});

// 3. Simulator Configuration
adminRouter.get('/simulator/config', (req: Request, res: Response) => {
  return res.status(200).json(store.config);
});

adminRouter.post('/simulator/configure', (req: Request, res: Response) => {
  const updates = req.body;
  store.config = { ...store.config, ...updates };
  store.addTrace('SIMULATOR_CONFIG_CHANGE', { updates, current: store.config });
  return res.status(200).json({ success: true, config: store.config });
});

// 4. Traces & Message Logs
adminRouter.get('/traces', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 100;
  return res.status(200).json({ traces: store.traces.slice(0, limit) });
});

adminRouter.get('/messages', (req: Request, res: Response) => {
  const phone = req.query.phone as string;
  const filtered = phone
    ? store.messages.filter((m) => m.recipientPhone.includes(phone.replace(/\D/g, '')))
    : store.messages;
  return res.status(200).json({ messages: filtered });
});

// 5. Manual Delivery Lifecycle Triggers
adminRouter.post('/messages/:id/deliver', async (req: Request, res: Response) => {
  const msg = store.messages.find((m) => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  const tenant = store.getTenantByPhoneId(msg.phoneNumberId) || store.tenants[0];

  msg.status = 'delivered';
  msg.updatedAt = new Date().toISOString();

  const dispatched = await WebhookDispatcher.dispatchStatusUpdate({
    wamid: msg.id,
    status: 'delivered',
    recipientPhone: msg.recipientPhone,
    wabaId: tenant.wabaId,
    phoneNumberId: msg.phoneNumberId,
  });

  return res.status(200).json({ success: true, dispatched, message: msg });
});

adminRouter.post('/messages/:id/read', async (req: Request, res: Response) => {
  const msg = store.messages.find((m) => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  const tenant = store.getTenantByPhoneId(msg.phoneNumberId) || store.tenants[0];

  msg.status = 'read';
  msg.updatedAt = new Date().toISOString();

  const dispatched = await WebhookDispatcher.dispatchStatusUpdate({
    wamid: msg.id,
    status: 'read',
    recipientPhone: msg.recipientPhone,
    wabaId: tenant.wabaId,
    phoneNumberId: msg.phoneNumberId,
  });

  return res.status(200).json({ success: true, dispatched, message: msg });
});

adminRouter.post('/messages/:id/fail', async (req: Request, res: Response) => {
  const msg = store.messages.find((m) => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  const tenant = store.getTenantByPhoneId(msg.phoneNumberId) || store.tenants[0];
  const { code, error } = req.body;

  msg.status = 'failed';
  msg.errorCode = code || 131026;
  msg.errorMessage = error || 'Message undeliverable';
  msg.updatedAt = new Date().toISOString();

  const dispatched = await WebhookDispatcher.dispatchStatusUpdate({
    wamid: msg.id,
    status: 'failed',
    recipientPhone: msg.recipientPhone,
    wabaId: tenant.wabaId,
    phoneNumberId: msg.phoneNumberId,
    errorCode: msg.errorCode,
    errorMessage: msg.errorMessage,
  });

  return res.status(200).json({ success: true, dispatched, message: msg });
});

// 6. Inbound Message Simulation (e.g. Opt-Out "STOP")
adminRouter.post('/inbound', async (req: Request, res: Response) => {
  const { from, text, wabaId, phoneNumberId } = req.body;
  if (!from || !text) {
    return res.status(400).json({ error: 'Parameters from and text are required' });
  }

  const tenant =
    (phoneNumberId && store.getTenantByPhoneId(phoneNumberId)) ||
    (wabaId && store.getTenantByWabaId(wabaId)) ||
    store.tenants[0];

  const dispatched = await WebhookDispatcher.dispatchInboundMessage({
    fromPhone: from,
    textBody: text,
    wabaId: tenant.wabaId,
    phoneNumberId: tenant.phoneNumberId,
  });

  return res.status(200).json({
    success: true,
    dispatched,
    from,
    text,
    targetWebhook: store.config.webhookUrl,
  });
});
