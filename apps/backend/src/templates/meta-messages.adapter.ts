import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TemplateComponentParameter {
  type: 'text' | 'image' | 'video' | 'document';
  text?: string;
  image?: { link?: string; id?: string };
  video?: { link?: string; id?: string };
  document?: { link?: string; filename?: string };
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'url' | 'quick_reply';
  index?: string | number;
  parameters: TemplateComponentParameter[];
}

export interface MetaSendMessagePayload {
  to: string; // E.164 phone number
  templateName: string;
  languageCode: string; // 'en', 'hi', etc.
  components: TemplateComponent[];
}

export type MetaErrorCategory = 'PERMANENT' | 'TRANSIENT' | 'AMBIGUOUS';

export interface MetaSendResult {
  success: boolean;
  wamid?: string;
  mockMode: boolean;
  errorCode?: string;
  errorMessage?: string;
  errorCategory?: MetaErrorCategory;
  rawResponse?: any;
}

@Injectable()
export class MetaMessagesAdapter {
  private readonly logger = new Logger(MetaMessagesAdapter.name);

  constructor(private readonly config: ConfigService) {}

  public get metaToken(): string {
    return this.config.get<string>('META_ACCESS_TOKEN') || process.env['META_ACCESS_TOKEN'] || '';
  }

  public get phoneNumberId(): string {
    const id = this.config.get<string>('META_PHONE_NUMBER_ID') || process.env['META_PHONE_NUMBER_ID'] || '';
    if (!id && this.dispatchMode === 'virtualized') {
      return 'phone-sit-2001';
    }
    return id;
  }

  public get graphApiVersion(): string {
    return this.config.get<string>('META_GRAPH_API_VERSION') || process.env['META_GRAPH_API_VERSION'] || 'v20.0';
  }

  public get baseGraphUrl(): string {
    if (this.dispatchMode === 'virtualized') {
      const waSim = this.config.get<string>('WA_SIM_URL') || process.env['WA_SIM_URL'];
      if (waSim) return waSim.replace(/\/+$/, '');
    }
    const url = this.config.get<string>('META_BASE_GRAPH_URL') || process.env['META_BASE_GRAPH_URL'] || 'https://graph.facebook.com';
    return url.replace(/\/+$/, '');
  }

  public get dispatchMode(): string {
    return (this.config.get<string>('DISPATCH_MODE') || process.env['DISPATCH_MODE'] || 'mock').toLowerCase();
  }

  public get isMockMode(): boolean {
    if (this.dispatchMode === 'mock') {
      return true;
    }
    if (this.dispatchMode === 'virtualized') {
      return false; // Virtualized mode executes real HTTP calls against mock-whatsapp-server
    }
    const token = this.metaToken;
    const nodeEnv = this.config.get<string>('NODE_ENV') || process.env['NODE_ENV'] || 'development';
    return (
      !token ||
      token.startsWith('dev_') ||
      token === 'mock_token' ||
      nodeEnv === 'test'
    );
  }

  private enforceZeroLeakageGuard(): void {
    const isSitMode = this.config.get<string>('SIT_MODE') === 'true' || this.dispatchMode === 'virtualized';
    if (isSitMode) {
      const lowerUrl = this.baseGraphUrl.toLowerCase();
      if (lowerUrl.includes('graph.facebook.com') || lowerUrl.includes('facebook.com') || lowerUrl.includes('meta.com')) {
        this.logger.error(
          `[CRITICAL SECURITY] Zero-Leakage Guard Violation: Blocked attempted dispatch to ${this.baseGraphUrl} in virtualized SIT mode!`
        );
        throw new Error(
          'Zero-Leakage Guard Violation: Live Meta Graph API cannot be targeted when running in virtualized/SIT mode.'
        );
      }
    }
  }

  /**
   * Formats recipient phone number to digits only (stripping +, spaces, dashes)
   */
  public normalizePhoneNumber(phone: string): string {
    return phone.replace(/[^\d]/g, '');
  }

  /**
   * Classifies HTTP and Meta error codes into actionable categories.
   */
  public classifyError(statusCode: number, metaErrorCode?: number): MetaErrorCategory {
    // 429 Rate Limit or 5xx Server Error -> TRANSIENT (retry)
    if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
      return 'TRANSIENT';
    }

    // Known Meta Cloud API transient error codes
    // 130429: Cloud API throughput limit reached
    // 131056: Rate limit hit (too many messages)
    // 2: Service temporarily unavailable
    // 1: Possible transient server error
    if (
      metaErrorCode === 130429 ||
      metaErrorCode === 131056 ||
      metaErrorCode === 2 ||
      metaErrorCode === 1
    ) {
      return 'TRANSIENT';
    }

    // Permanent errors: invalid templates, invalid phone, policy blocks, auth errors
    // 132000: Template does not exist
    // 132001: Template components do not match
    // 131026: Message undeliverable / invalid phone number
    // 131047: Re-engagement window expired
    // 100: Invalid parameter
    // 190: Invalid OAuth access token
    return 'PERMANENT';
  }

  /**
   * Sends an approved template message via Meta WhatsApp Cloud API.
   */
  async sendMessage(payload: MetaSendMessagePayload): Promise<MetaSendResult> {
    const normalizedTo = this.normalizePhoneNumber(payload.to);

    if (this.isMockMode) {
      const mockWamid = `wamid.HBgM${Date.now()}${Math.floor(Math.random() * 1000000)}Mock`;
      this.logger.log(
        `[MOCK DISPATCH] Simulated WhatsApp dispatch to ${normalizedTo.slice(0, 4)}****${normalizedTo.slice(-2)} | Template: ${payload.templateName} | WAMID: ${mockWamid}`,
      );
      return {
        success: true,
        wamid: mockWamid,
        mockMode: true,
      };
    }

    this.enforceZeroLeakageGuard();

    // Fail-closed guard for live mode
    if (!this.metaToken || !this.phoneNumberId) {
      this.logger.error(
        `[CRITICAL] Missing required Meta credentials for live dispatch. Phone: ${normalizedTo}`,
      );
      return {
        success: false,
        mockMode: false,
        errorCode: 'CONFIG_MISSING_CREDENTIALS',
        errorMessage: 'Meta access token or phone number ID is missing',
        errorCategory: 'PERMANENT',
      };
    }

    const endpoint = `${this.baseGraphUrl}/${this.graphApiVersion}/${this.phoneNumberId}/messages`;

    const requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'template',
      template: {
        name: payload.templateName,
        language: {
          code: payload.languageCode || 'en',
        },
        components: payload.components && payload.components.length > 0 ? payload.components : undefined,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.metaToken}`,
      'Content-Type': 'application/json',
    };
    if (this.dispatchMode === 'virtualized') {
      headers['X-WA-Sim-Direct'] = '1';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseJson = (await response.json()) as any;

      if (response.ok && responseJson?.messages?.[0]?.id) {
        const wamid = responseJson.messages[0].id;
        this.logger.log(
          `✅ [LIVE DISPATCH] Sent WhatsApp to ${normalizedTo.slice(0, 4)}****${normalizedTo.slice(-2)} | Template: ${payload.templateName} | WAMID: ${wamid}`,
        );
        return {
          success: true,
          wamid,
          mockMode: false,
          rawResponse: responseJson,
        };
      }

      // Handle Meta API error structure
      const metaError = responseJson?.error || {};
      const metaCode = metaError.code;
      const metaMsg = metaError.message || `HTTP ${response.status} ${response.statusText}`;
      const category = this.classifyError(response.status, metaCode);

      this.logger.warn(
        `⚠️ Meta API error sending to ${normalizedTo.slice(0, 4)}****${normalizedTo.slice(-2)}: Code ${metaCode} [${category}] - ${metaMsg}`,
      );

      return {
        success: false,
        mockMode: false,
        errorCode: metaCode ? String(metaCode) : `HTTP_${response.status}`,
        errorMessage: metaMsg,
        errorCategory: category,
        rawResponse: responseJson,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        this.logger.error(
          `⏱️ Meta API request timed out after 10s sending to ${normalizedTo.slice(0, 4)}****${normalizedTo.slice(-2)}. Classifying as AMBIGUOUS.`,
        );
        return {
          success: false,
          mockMode: false,
          errorCode: 'AMBIGUOUS_TIMEOUT',
          errorMessage: 'Meta API HTTP request timed out after 10 seconds. Delivery outcome unverified.',
          errorCategory: 'AMBIGUOUS',
        };
      }

      this.logger.error(`Network error contacting Meta API: ${err.message}`);
      return {
        success: false,
        mockMode: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: err.message,
        errorCategory: 'TRANSIENT',
      };
    }
  }

  /**
   * Dispatches a freeform text message (for customer care / inbound reply within 24hr window).
   */
  async sendTextMessage(to: string, text: string): Promise<MetaSendResult> {
    const normalizedTo = this.normalizePhoneNumber(to);

    if (this.isMockMode) {
      const mockWamid = `mock_txt_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.logger.log(
        `[MOCK DISPATCH] Simulated text message to ${normalizedTo.slice(0, 4)}****${normalizedTo.slice(-2)}: "${text.slice(0, 40)}..." | WAMID: ${mockWamid}`,
      );
      return {
        success: true,
        wamid: mockWamid,
        mockMode: true,
      };
    }

    this.enforceZeroLeakageGuard();

    if (!this.metaToken || !this.phoneNumberId) {
      return {
        success: false,
        mockMode: false,
        errorCode: 'CONFIG_MISSING_CREDENTIALS',
        errorMessage: 'Meta access token or phone number ID is missing',
        errorCategory: 'PERMANENT',
      };
    }

    const endpoint = `${this.baseGraphUrl}/${this.graphApiVersion}/${this.phoneNumberId}/messages`;
    const requestBody = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.metaToken}`,
      'Content-Type': 'application/json',
    };
    if (this.dispatchMode === 'virtualized') {
      headers['X-WA-Sim-Direct'] = '1';
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseJson = (await response.json()) as any;

      if (response.ok && responseJson?.messages?.[0]?.id) {
        const wamid = responseJson.messages[0].id;
        this.logger.log(
          `✅ [LIVE TEXT DISPATCH] Sent to ${normalizedTo.slice(0, 4)}****${normalizedTo.slice(-2)} | WAMID: ${wamid}`,
        );
        return {
          success: true,
          wamid,
          mockMode: false,
          rawResponse: responseJson,
        };
      }

      const metaError = responseJson?.error || {};
      const metaCode = metaError.code;
      const metaMsg = metaError.message || `HTTP ${response.status}`;
      return {
        success: false,
        mockMode: false,
        errorCode: metaCode ? String(metaCode) : `HTTP_${response.status}`,
        errorMessage: metaMsg,
        errorCategory: this.classifyError(response.status, metaCode),
        rawResponse: responseJson,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return {
        success: false,
        mockMode: false,
        errorCode: err.name === 'AbortError' ? 'AMBIGUOUS_TIMEOUT' : 'NETWORK_ERROR',
        errorMessage: err.message,
        errorCategory: err.name === 'AbortError' ? 'AMBIGUOUS' : 'TRANSIENT',
      };
    }
  }
}
