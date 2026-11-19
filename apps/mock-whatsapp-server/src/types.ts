export interface VirtualTenant {
  id: string;
  name: string;
  wabaId: string;
  phoneNumberId: string;
  phoneNumber: string;
  displayName: string;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  tier: string;
}

export interface VirtualMessage {
  id: string; // WAMID e.g. wamid.HBg...
  tenantId: string;
  phoneNumberId: string;
  recipientPhone: string;
  type: 'template' | 'text' | 'image' | 'document';
  payload: any;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorCode?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  direction: 'outbound' | 'inbound';
}

export interface VirtualTemplate {
  id: string;
  wabaId: string;
  name: string;
  language: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: any[];
  qualityRating: 'GREEN' | 'YELLOW' | 'RED';
}

export interface SimulatorConfig {
  latencyMs: number;
  failureRate: number; // 0 to 1
  forcedError?: {
    status: number;
    code: number;
    message: string;
    type: string;
    error_subcode?: number;
  } | null;
  autoDeliverMs: number; // default e.g. 50ms, 0 means manual
  autoReadMs: number; // default e.g. 150ms, 0 means manual
  dropWebhooks: boolean;
  webhookUrl: string;
  webhookSecret: string;
  rules: PhoneRule[];
}

export interface PhoneRule {
  suffix: string; // e.g. "999" -> fails with 131026
  action: 'fail' | 'rate_limit' | 'timeout' | 'reject_template';
  errorCode?: number;
  errorMessage?: string;
}

export interface TraceRecord {
  id: string;
  timestamp: string;
  type: 'INCOMING_API_CALL' | 'WEBHOOK_DISPATCHED' | 'INBOUND_MESSAGE_SIMULATED' | 'SIMULATOR_CONFIG_CHANGE';
  details: any;
}
