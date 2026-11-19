export type DeliveryStatusType = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'UNDELIVERABLE';

export const STATUS_MONOTONIC_RANK: Record<DeliveryStatusType, number> = {
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 5,
  UNDELIVERABLE: 5,
};

export interface MetaWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
          pricing?: {
            billable: boolean;
            pricing_model: string;
            category: string;
          };
          errors?: Array<{
            code: number;
            title: string;
            message?: string;
          }>;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: {
            body: string;
          };
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * Creates a standard Meta delivery status webhook payload.
 */
export function createDeliveryStatusWebhook(
  metaMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  recipientId = '919876543210',
  timestamp = Math.floor(Date.now() / 1000).toString(),
  errorCode?: number,
): MetaWebhookPayload {
  const statusObject: any = {
    id: metaMessageId,
    status,
    timestamp,
    recipient_id: recipientId,
    pricing: {
      billable: true,
      pricing_model: 'CBP',
      category: 'marketing',
    },
  };

  if (errorCode) {
    statusObject.errors = [
      {
        code: errorCode,
        title: 'Message delivery failure',
        message: 'Message could not be delivered to the recipient.',
      },
    ];
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '109876543210123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+919876543200',
                phone_number_id: '123456789012345',
              },
              statuses: [statusObject],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Creates an inbound message webhook payload (e.g. for STOP / UNSUBSCRIBE).
 */
export function createInboundMessageWebhook(
  fromPhone = '919876543210',
  messageText = 'STOP',
  metaMessageId = `wamid.inbound_${Date.now()}`,
  timestamp = Math.floor(Date.now() / 1000).toString(),
): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '109876543210123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+919876543200',
                phone_number_id: '123456789012345',
              },
              messages: [
                {
                  from: fromPhone,
                  id: metaMessageId,
                  timestamp,
                  type: 'text',
                  text: {
                    body: messageText,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * Pre-constructed monotonic delivery sequence for testing.
 */
export const MONOTONIC_TEST_SEQUENCE = {
  messageId: 'wamid.test_seq_001',
  recipient: '919876543210',
  sent: createDeliveryStatusWebhook('wamid.test_seq_001', 'sent', '919876543210', '1763539000'),
  delivered: createDeliveryStatusWebhook('wamid.test_seq_001', 'delivered', '919876543210', '1763539005'),
  read: createDeliveryStatusWebhook('wamid.test_seq_001', 'read', '919876543210', '1763539010'),
  failed: createDeliveryStatusWebhook('wamid.test_seq_001', 'failed', '919876543210', '1763539002', 131026),
};

export const OPT_OUT_KEYWORD_PAYLOADS = [
  { keyword: 'STOP', payload: createInboundMessageWebhook('919876543210', 'STOP') },
  { keyword: 'UNSUBSCRIBE', payload: createInboundMessageWebhook('919876543210', 'UNSUBSCRIBE') },
  { keyword: 'OPT OUT', payload: createInboundMessageWebhook('919876543210', 'OPT OUT') },
  { keyword: 'रुकें', payload: createInboundMessageWebhook('919876543210', 'रुकें') },
];
