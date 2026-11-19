import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetaMessagesAdapter } from '../../templates/meta-messages.adapter';

describe('MetaMessagesAdapter', () => {
  let adapter: MetaMessagesAdapter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaMessagesAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'META_ACCESS_TOKEN') return 'dev_meta_access_token';
              if (key === 'META_PHONE_NUMBER_ID') return '1234567890';
              if (key === 'META_GRAPH_API_VERSION') return 'v20.0';
              if (key === 'META_BASE_GRAPH_URL') return 'https://graph.facebook.com';
              if (key === 'DISPATCH_MODE') return 'mock';
              if (key === 'NODE_ENV') return 'test';
              return null;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<MetaMessagesAdapter>(MetaMessagesAdapter);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Mock Mode Dispatch', () => {
    it('should detect mock mode when DISPATCH_MODE is mock or token starts with dev_', () => {
      expect(adapter.isMockMode).toBe(true);
    });

    it('should return a simulated success result with mock wamid without calling external API', async () => {
      const result = await adapter.sendMessage({
        to: '+91 98765 43210',
        templateName: 'birthday_vip_wishes_v1',
        languageCode: 'en',
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: 'Rajesh Kumar' }],
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.mockMode).toBe(true);
      expect(result.wamid).toBeDefined();
      expect(result.wamid).toMatch(/^wamid\.HBgM/);
    });

    it('should properly normalize phone numbers removing non-digit characters', () => {
      expect(adapter.normalizePhoneNumber('+91 (987) 654-3210')).toBe('919876543210');
      expect(adapter.normalizePhoneNumber('+919825099887')).toBe('919825099887');
    });
  });

  describe('Error Classification Taxonomy', () => {
    it('should classify HTTP 429 and 5xx as TRANSIENT', () => {
      expect(adapter.classifyError(429)).toBe('TRANSIENT');
      expect(adapter.classifyError(500)).toBe('TRANSIENT');
      expect(adapter.classifyError(503)).toBe('TRANSIENT');
    });

    it('should classify Meta Cloud API rate limit codes as TRANSIENT', () => {
      expect(adapter.classifyError(400, 130429)).toBe('TRANSIENT');
      expect(adapter.classifyError(400, 131056)).toBe('TRANSIENT');
      expect(adapter.classifyError(400, 2)).toBe('TRANSIENT');
    });

    it('should classify client errors and template errors as PERMANENT', () => {
      expect(adapter.classifyError(400, 132000)).toBe('PERMANENT'); // Template does not exist
      expect(adapter.classifyError(400, 132001)).toBe('PERMANENT'); // Components mismatch
      expect(adapter.classifyError(400, 131026)).toBe('PERMANENT'); // Undeliverable
      expect(adapter.classifyError(401, 190)).toBe('PERMANENT'); // Invalid token
      expect(adapter.classifyError(404)).toBe('PERMANENT');
    });
  });

  describe('Live Mode API Request & Timeout', () => {
    it('should classify network abort/timeout as AMBIGUOUS', async () => {
      // Force live mode for test
      jest.spyOn(adapter, 'isMockMode', 'get').mockReturnValue(false);
      jest.spyOn(adapter, 'metaToken', 'get').mockReturnValue('real_live_token_123');

      // Mock global fetch to abort
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(() => {
        const error: any = new Error('The operation was aborted');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      const result = await adapter.sendMessage({
        to: '+919876543210',
        templateName: 'test_template',
        languageCode: 'en',
        components: [],
      });

      expect(result.success).toBe(false);
      expect(result.errorCategory).toBe('AMBIGUOUS');
      expect(result.errorCode).toBe('AMBIGUOUS_TIMEOUT');

      global.fetch = originalFetch;
    });
  });
});
