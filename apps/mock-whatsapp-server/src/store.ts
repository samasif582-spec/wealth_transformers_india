import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../backend/.env') });
dotenv.config();

import {
  VirtualTenant,
  VirtualMessage,
  VirtualTemplate,
  SimulatorConfig,
  TraceRecord,
} from './types';

const STATE_FILE = path.join(__dirname, '../data/state.json');

export class StateStore {
  public tenants: VirtualTenant[] = [];
  public templates: VirtualTemplate[] = [];
  public messages: VirtualMessage[] = [];
  public traces: TraceRecord[] = [];
  public config: SimulatorConfig = {
    latencyMs: 10,
    failureRate: 0,
    forcedError: null,
    autoDeliverMs: 80,
    autoReadMs: 200,
    dropWebhooks: false,
    webhookUrl: process.env.SUT_WEBHOOK_URL || 'http://localhost:3000/api/v1/webhooks/meta',
    webhookSecret: process.env.META_APP_SECRET || 'dev_meta_app_secret_32_chars_long!!',
    rules: [
      {
        suffix: '99',
        action: 'fail',
        errorCode: 131026,
        errorMessage: 'Message undeliverable to this destination',
      },
      {
        suffix: '88',
        action: 'rate_limit',
        errorCode: 130429,
        errorMessage: 'Rate limit hit for destination number',
      },
    ],
  };

  constructor() {
    this.seedDefaultData();
  }

  public seedDefaultData(): void {
    this.tenants = [
      {
        id: 'tenant-sit-001',
        name: 'Wealth Transformers SIT Main',
        wabaId: 'waba-sit-1001',
        phoneNumberId: 'phone-sit-2001',
        phoneNumber: '+919876543210',
        displayName: 'Wealth Transformers SIT',
        qualityRating: 'GREEN',
        tier: 'TIER_1',
      },
      {
        id: 'tenant-sit-002',
        name: 'Wealth Transformers Secondary',
        wabaId: 'waba-sit-1002',
        phoneNumberId: 'phone-sit-2002',
        phoneNumber: '+919876543211',
        displayName: 'WT Alternate Desk',
        qualityRating: 'YELLOW',
        tier: 'TIER_2',
      },
    ];

    this.templates = [
      {
        id: 'tpl-diwali-001',
        wabaId: 'waba-sit-1001',
        name: 'wealth_trade_diwali_2024',
        language: 'en',
        status: 'APPROVED',
        category: 'MARKETING',
        qualityRating: 'GREEN',
        components: [
          {
            type: 'HEADER',
            format: 'IMAGE',
          },
          {
            type: 'BODY',
            text: 'Dear {{1}}, wishing you and your family a prosperous Diwali! May your investments bring abundance and happiness. - Wealth Transformers India Pvt Ltd',
          },
          {
            type: 'FOOTER',
            text: 'SEBI Reg: INH000000000 | Investments in securities market are subject to market risks. Read all scheme related documents carefully.',
          },
        ],
      },
      {
        id: 'tpl-bday-001',
        wabaId: 'waba-sit-1001',
        name: 'client_birthday_wishes_v1',
        language: 'en',
        status: 'APPROVED',
        category: 'UTILITY',
        qualityRating: 'GREEN',
        components: [
          {
            type: 'BODY',
            text: 'Dear {{1}}, happy birthday from Wealth Transformers India Pvt Ltd! We wish you health, happiness, and continued wealth creation.',
          },
        ],
      },
      {
        id: 'tpl-anniv-001',
        wabaId: 'waba-sit-1001',
        name: 'wealth_transformers_anniversary_v1',
        language: 'en',
        status: 'APPROVED',
        category: 'UTILITY',
        qualityRating: 'GREEN',
        components: [
          {
            type: 'BODY',
            text: 'Dear {{1}}, celebrating {{2}} years of financial journey together! Thank you for trusting Wealth Transformers India Pvt Ltd.',
          },
        ],
      },
      {
        id: 'tpl-weekly-001',
        wabaId: 'waba-sit-1001',
        name: 'nifty_weekly_market_update',
        language: 'en',
        status: 'APPROVED',
        category: 'MARKETING',
        qualityRating: 'YELLOW',
        components: [
          {
            type: 'BODY',
            text: 'Hello {{1}}, here is your weekly NIFTY & Bank NIFTY technical outlook. Key support at {{2}} and resistance at {{3}}.',
          },
          {
            type: 'FOOTER',
            text: 'Wealth Transformers India Pvt Ltd. Securities investments are subject to market risks.',
          },
        ],
      },
    ];

    this.messages = [];
    this.traces = [];
    this.addTrace('SIMULATOR_CONFIG_CHANGE', { message: 'Initialized state with default SIT seed data' });
  }

  public reset(): void {
    this.messages = [];
    this.traces = [];
    this.seedDefaultData();
  }

  public addTrace(type: TraceRecord['type'], details: any): void {
    const trace: TraceRecord = {
      id: `trace_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      type,
      details,
    };
    this.traces.unshift(trace);
    // Keep max 1000 traces in memory
    if (this.traces.length > 1000) {
      this.traces.length = 1000;
    }
  }

  public getTenantByPhoneId(phoneId: string): VirtualTenant | undefined {
    return this.tenants.find((t) => t.phoneNumberId === phoneId);
  }

  public getTenantByWabaId(wabaId: string): VirtualTenant | undefined {
    return this.tenants.find((t) => t.wabaId === wabaId);
  }
}

export const store = new StateStore();
