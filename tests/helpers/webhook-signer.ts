import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_APP_SECRET = process.env.META_APP_SECRET || 'dev_meta_app_secret';

export class WebhookSigner {
  private readonly defaultSecret: string;

  constructor(defaultSecret = DEFAULT_APP_SECRET) {
    this.defaultSecret = defaultSecret;
  }

  /**
   * Serializes payload to a Buffer/string consistently.
   */
  private toBuffer(payload: string | Buffer | object): Buffer {
    if (Buffer.isBuffer(payload)) {
      return payload;
    }
    if (typeof payload === 'string') {
      return Buffer.from(payload, 'utf8');
    }
    return Buffer.from(JSON.stringify(payload), 'utf8');
  }

  /**
   * Computes the HMAC-SHA256 hex digest for a payload.
   */
  public computeHmacHex(payload: string | Buffer | object, secret = this.defaultSecret): string {
    const buf = this.toBuffer(payload);
    return crypto.createHmac('sha256', secret).update(buf).digest('hex');
  }

  /**
   * Generates the authentic Meta X-Hub-Signature-256 header value: `sha256=<hex>`
   */
  public generateSignature(payload: string | Buffer | object, secret = this.defaultSecret): string {
    const hex = this.computeHmacHex(payload, secret);
    return `sha256=${hex}`;
  }

  /**
   * Returns a headers dictionary containing the X-Hub-Signature-256 header.
   */
  public generateHeader(payload: string | Buffer | object, secret = this.defaultSecret): Record<string, string> {
    return {
      'X-Hub-Signature-256': this.generateSignature(payload, secret),
      'Content-Type': 'application/json',
    };
  }

  /**
   * Verifies an incoming X-Hub-Signature-256 header against a payload using timingSafeEqual.
   */
  public verifySignature(
    payload: string | Buffer | object,
    signatureHeader: string,
    secret = this.defaultSecret,
  ): boolean {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const providedHex = signatureHeader.slice('sha256='.length);
    const expectedHex = this.computeHmacHex(payload, secret);

    const providedBuf = Buffer.from(providedHex, 'utf8');
    const expectedBuf = Buffer.from(expectedHex, 'utf8');

    if (providedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  }

  /**
   * Generates an intentionally invalid/tampered signature for negative testing.
   */
  public generateTamperedSignature(payload: string | Buffer | object): string {
    const valid = this.computeHmacHex(payload);
    // Invert the last character
    const lastChar = valid.slice(-1);
    const inverted = lastChar === '0' ? '1' : '0';
    return `sha256=${valid.slice(0, -1)}${inverted}`;
  }
}

export const webhookSigner = new WebhookSigner();
