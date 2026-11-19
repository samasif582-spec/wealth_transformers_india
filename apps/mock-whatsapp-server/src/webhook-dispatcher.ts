import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { store } from './store';

export class WebhookDispatcher {
  public static async dispatchPayload(payload: any): Promise<boolean> {
    if (store.config.dropWebhooks) {
      store.addTrace('WEBHOOK_DISPATCHED', {
        status: 'DROPPED',
        reason: 'dropWebhooks flag is enabled in simulator',
        payload,
      });
      return false;
    }

    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', store.config.webhookSecret)
      .update(payloadString)
      .digest('hex');

    const webhookUrlStr = store.config.webhookUrl;
    store.addTrace('WEBHOOK_DISPATCHED', {
      targetUrl: webhookUrlStr,
      signature: `sha256=${signature}`,
      payload,
    });

    try {
      const parsedUrl = new URL(webhookUrlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      await new Promise<void>((resolve, reject) => {
        const req = transport.request(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (isHttps ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payloadString),
              'X-Hub-Signature-256': `sha256=${signature}`,
              'User-Agent': 'Meta-WhatsApp-Cloud-API-Simulator/1.0',
            },
            timeout: 5000,
          },
          (res) => {
            let resData = '';
            res.on('data', (chunk) => (resData += chunk));
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve();
              } else {
                reject(new Error(`Webhook endpoint returned HTTP ${res.statusCode}: ${resData}`));
              }
            });
          }
        );

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Webhook request timed out after 5000ms'));
        });

        req.write(payloadString);
        req.end();
      });

      return true;
    } catch (err: any) {
      store.addTrace('WEBHOOK_DISPATCHED', {
        status: 'FAILED',
        error: err.message,
        targetUrl: webhookUrlStr,
      });
      console.warn(`[MockWhatsAppServer] Webhook dispatch error: ${err.message}`);
      return false;
    }
  }

  public static async dispatchStatusUpdate(options: {
    wamid: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    recipientPhone: string;
    wabaId: string;
    phoneNumberId: string;
    errorCode?: number;
    errorMessage?: string;
  }): Promise<boolean> {
    const cleanPhone = options.recipientPhone.replace(/\D/g, '');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const statusObj: any = {
      id: options.wamid,
      status: options.status,
      timestamp,
      recipient_id: cleanPhone,
      pricing: {
        billable: true,
        pricing_model: 'CBP',
        category: 'marketing',
      },
    };

    if (options.status === 'failed') {
      statusObj.errors = [
        {
          code: options.errorCode || 131026,
          title: options.errorMessage || 'Message undeliverable',
          message: options.errorMessage || 'Message undeliverable',
          error_data: {
            details: 'Virtual destination failure simulation',
          },
        },
      ];
    }

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: options.wabaId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '919876543210',
                  phone_number_id: options.phoneNumberId,
                },
                statuses: [statusObj],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    return this.dispatchPayload(payload);
  }

  public static async dispatchInboundMessage(options: {
    fromPhone: string;
    textBody: string;
    wabaId: string;
    phoneNumberId: string;
  }): Promise<boolean> {
    const cleanPhone = options.fromPhone.replace(/\D/g, '');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const inboundWamid = `wamid.HBgL${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: options.wabaId,
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '919876543210',
                  phone_number_id: options.phoneNumberId,
                },
                contacts: [
                  {
                    profile: { name: `Client +${cleanPhone}` },
                    wa_id: cleanPhone,
                  },
                ],
                messages: [
                  {
                    from: cleanPhone,
                    id: inboundWamid,
                    timestamp,
                    text: { body: options.textBody },
                    type: 'text',
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    store.addTrace('INBOUND_MESSAGE_SIMULATED', {
      from: cleanPhone,
      text: options.textBody,
      wamid: inboundWamid,
    });

    return this.dispatchPayload(payload);
  }
}
