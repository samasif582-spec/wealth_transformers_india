import { Router, Request, Response } from 'express';
import { store } from './store';
import { WebhookDispatcher } from './webhook-dispatcher';
import { VirtualMessage } from './types';

export const graphRouter = Router();

// Handle /:version/:phoneNumberId/messages or /:phoneNumberId/messages
const handleSendMessage = async (req: Request, res: Response) => {
  const phoneNumberId = req.params.phoneNumberId;
  const version = req.params.version || 'v20.0';

  store.addTrace('INCOMING_API_CALL', {
    method: 'POST',
    path: req.originalUrl,
    headers: req.headers,
    body: req.body,
  });

  // 1. Check artificial latency
  if (store.config.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, store.config.latencyMs));
  }

  // 2. Auth header verification
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'Invalid OAuth access token - Cannot parse access token',
        type: 'OAuthException',
        code: 190,
        fbtrace_id: `mock_trace_${Date.now()}`,
      },
    });
  }

  // 3. Forced Error Injection
  if (store.config.forcedError) {
    const err = store.config.forcedError;
    return res.status(err.status || 400).json({
      error: {
        message: err.message,
        type: err.type,
        code: err.code,
        error_subcode: err.error_subcode,
        fbtrace_id: `mock_trace_${Date.now()}`,
      },
    });
  }

  // 4. Random failure rate injection
  if (store.config.failureRate > 0 && Math.random() < store.config.failureRate) {
    return res.status(500).json({
      error: {
        message: 'Temporary internal server error on WhatsApp infrastructure',
        type: 'OAuthException',
        code: 1,
        fbtrace_id: `mock_trace_${Date.now()}`,
      },
    });
  }

  // 5. Payload validation
  const { to, type, template, text } = req.body;
  if (!to) {
    return res.status(400).json({
      error: {
        message: '(#100) The parameter to is required',
        type: 'OAuthException',
        code: 100,
      },
    });
  }

  const recipientPhone = String(to).replace(/\D/g, '');

  // 6. Check Phone-specific rules
  for (const rule of store.config.rules) {
    if (recipientPhone.endsWith(rule.suffix)) {
      if (rule.action === 'rate_limit') {
        return res.status(429).json({
          error: {
            message: rule.errorMessage || '(#130429) Rate limit hit for recipient',
            type: 'OAuthException',
            code: rule.errorCode || 130429,
          },
        });
      }
      if (rule.action === 'fail') {
        // Generates sent response but will immediately dispatch a failed webhook
        const wamid = `wamid.HBgL${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const tenant = store.getTenantByPhoneId(phoneNumberId) || store.tenants[0];

        const virtualMsg: VirtualMessage = {
          id: wamid,
          tenantId: tenant.id,
          phoneNumberId,
          recipientPhone,
          type: type || 'text',
          payload: req.body,
          status: 'failed',
          errorCode: rule.errorCode || 131026,
          errorMessage: rule.errorMessage || 'Message undeliverable',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          direction: 'outbound',
        };
        store.messages.push(virtualMsg);

        // Schedule failure webhook
        setTimeout(() => {
          WebhookDispatcher.dispatchStatusUpdate({
            wamid,
            status: 'failed',
            recipientPhone,
            wabaId: tenant.wabaId,
            phoneNumberId,
            errorCode: rule.errorCode || 131026,
            errorMessage: rule.errorMessage || 'Message undeliverable',
          });
        }, store.config.autoDeliverMs || 50);

        return res.status(200).json({
          messaging_product: 'whatsapp',
          contacts: [{ input: to, wa_id: recipientPhone }],
          messages: [{ id: wamid }],
        });
      }
    }
  }

  // 7. Success Path
  const wamid = `wamid.HBgL${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const tenant = store.getTenantByPhoneId(phoneNumberId) || store.tenants[0];

  const virtualMsg: VirtualMessage = {
    id: wamid,
    tenantId: tenant.id,
    phoneNumberId,
    recipientPhone,
    type: type || 'template',
    payload: req.body,
    status: 'sent',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    direction: 'outbound',
  };
  store.messages.push(virtualMsg);

  // Auto-relay outbound message to cloned WhatsApp Web emulator on Port 4020
  try {
    fetch(`http://localhost:4020/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wa-sim-local-dev-token',
        'X-WA-Sim-UI': '1',
      },
      body: JSON.stringify(req.body),
    })
      .then(async (r) => {
        if (!r.ok) {
          const text = await r.text();
          console.warn(`[MockWhatsAppServer] Relay to WA-Sim (4020) returned HTTP ${r.status}: ${text}`);
        }
      })
      .catch((err) => {
        console.warn(`[MockWhatsAppServer] Relay to WA-Sim failed: ${err.message}`);
      });
  } catch {
    // Non-blocking relay
  }

  // Auto-schedule delivered and read webhooks if enabled
  if (store.config.autoDeliverMs > 0) {
    setTimeout(() => {
      virtualMsg.status = 'delivered';
      virtualMsg.updatedAt = new Date().toISOString();
      WebhookDispatcher.dispatchStatusUpdate({
        wamid,
        status: 'delivered',
        recipientPhone,
        wabaId: tenant.wabaId,
        phoneNumberId,
      });

      if (store.config.autoReadMs > 0) {
        setTimeout(() => {
          virtualMsg.status = 'read';
          virtualMsg.updatedAt = new Date().toISOString();
          WebhookDispatcher.dispatchStatusUpdate({
            wamid,
            status: 'read',
            recipientPhone,
            wabaId: tenant.wabaId,
            phoneNumberId,
          });
        }, store.config.autoReadMs);
      }
    }, store.config.autoDeliverMs);
  }

  return res.status(200).json({
    messaging_product: 'whatsapp',
    contacts: [{ input: to, wa_id: recipientPhone }],
    messages: [{ id: wamid }],
  });
};

// Route matching for message dispatch
graphRouter.post('/:version/:phoneNumberId/messages', handleSendMessage);
graphRouter.post('/:phoneNumberId/messages', handleSendMessage);

// Phone Number status / verification check (for AdminService health probe)
const handleGetPhoneNumber = (req: Request, res: Response) => {
  const phoneId = req.params.phoneNumberId;
  const tenant = store.getTenantByPhoneId(phoneId) || store.tenants[0];

  return res.status(200).json({
    verified_name: tenant.displayName,
    code_verification_status: 'VERIFIED',
    display_phone_number: tenant.phoneNumber,
    quality_rating: tenant.qualityRating,
    id: phoneId,
  });
};

graphRouter.get('/:version/:phoneNumberId', handleGetPhoneNumber);
graphRouter.get('/:phoneNumberId', handleGetPhoneNumber);

// Template list: /:version/:wabaId/message_templates
const handleListTemplates = (req: Request, res: Response) => {
  const wabaId = req.params.wabaId;
  const filtered = store.templates.filter((t) => !wabaId || t.wabaId === wabaId);
  return res.status(200).json({
    data: filtered,
    paging: {
      cursors: {
        before: 'cur_before',
        after: 'cur_after',
      },
    },
  });
};

graphRouter.get('/:version/:wabaId/message_templates', handleListTemplates);
graphRouter.get('/:wabaId/message_templates', handleListTemplates);

// Create template
const handleCreateTemplate = (req: Request, res: Response) => {
  const wabaId = req.params.wabaId;
  const { name, category, language, components } = req.body;

  if (!name || !category) {
    return res.status(400).json({
      error: {
        message: 'Template name and category are required',
        type: 'OAuthException',
        code: 100,
      },
    });
  }

  const newId = `tpl_${Date.now()}`;
  const newTemplate = {
    id: newId,
    wabaId: wabaId || store.tenants[0].wabaId,
    name,
    category: category.toUpperCase(),
    language: language || 'en',
    status: 'APPROVED' as const,
    qualityRating: 'GREEN' as const,
    components: components || [],
  };

  store.templates.push(newTemplate);
  store.addTrace('INCOMING_API_CALL', {
    action: 'CREATE_TEMPLATE',
    template: newTemplate,
  });

  // Auto-relay template definition to cloned WhatsApp Web emulator on Port 4020
  try {
    const compList = Array.isArray(components) ? components : [];
    const bodyComp = compList.find((c: any) => (c.type || '').toUpperCase() === 'BODY');
    const headerComp = compList.find((c: any) => (c.type || '').toUpperCase() === 'HEADER');
    const footerComp = compList.find((c: any) => (c.type || '').toUpperCase() === 'FOOTER');
    const buttonsComp = compList.find((c: any) => (c.type || '').toUpperCase() === 'BUTTONS');

    const headerImageUrl =
      headerComp?.header_media_url ||
      headerComp?.example?.header_handle?.[0];

    fetch('http://localhost:4020/api/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wa-sim-local-dev-token',
      },
      body: JSON.stringify({
        name,
        category: category.toUpperCase(),
        language: language || 'en',
        status: 'APPROVED',
        bodyText: bodyComp?.text || `Dear {{1}}, update regarding ${name}.`,
        headerText: headerComp?.text,
        headerImageUrl: headerImageUrl || undefined,
        footerText: footerComp?.text,
        buttons: buttonsComp?.buttons || [],
      }),
    }).catch(() => {});
  } catch {
    // Non-blocking relay
  }

  return res.status(200).json({
    id: newId,
    status: 'APPROVED',
    category: newTemplate.category,
  });
};

graphRouter.post('/:version/:wabaId/message_templates', handleCreateTemplate);
graphRouter.post('/:wabaId/message_templates', handleCreateTemplate);

// Template detail & delete
graphRouter.get('/:version/templates/:templateId', (req, res) => {
  const found = store.templates.find((t) => t.id === req.params.templateId || t.name === req.params.templateId);
  if (!found) return res.status(404).json({ error: { message: 'Template not found', code: 100 } });
  return res.status(200).json(found);
});

graphRouter.delete('/:version/templates/:templateId', (req, res) => {
  const index = store.templates.findIndex((t) => t.id === req.params.templateId || t.name === req.params.templateId);
  if (index >= 0) store.templates.splice(index, 1);
  return res.status(200).json({ success: true });
});
