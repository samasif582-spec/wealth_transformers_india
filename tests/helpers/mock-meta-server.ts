import * as http from 'http';
import { AddressInfo } from 'net';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: unknown;
  timestamp: number;
}

export class MockMetaServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private recordedRequests: RecordedRequest[] = [];
  private customHandlers: Map<string, { status: number; body: unknown }> = new Map();
  private simulateFailure: boolean = false;
  private failureStatusCode: number = 500;

  constructor() {}

  public get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  public get isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Starts the mock server on specified or ephemeral port.
   */
  public async start(port = 0): Promise<number> {
    if (this.server) {
      return this.port;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        let rawBody = '';
        req.on('data', (chunk) => {
          rawBody += chunk;
        });

        req.on('end', () => {
          let parsedBody: unknown = rawBody;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            // Keep raw string or empty
          }

          const recorded: RecordedRequest = {
            method: req.method || 'GET',
            path: req.url || '/',
            headers: req.headers,
            body: parsedBody,
            timestamp: Date.now(),
          };
          this.recordedRequests.push(recorded);

          if (this.simulateFailure) {
            res.writeHead(this.failureStatusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Simulated Meta API failure', code: 500 } }));
            return;
          }

          // Check custom handlers
          const cleanPath = req.url?.split('?')[0] || '';
          if (this.customHandlers.has(cleanPath)) {
            const custom = this.customHandlers.get(cleanPath)!;
            res.writeHead(custom.status, { 'Content-Type': 'application/json' });
            res.end(typeof custom.body === 'string' ? custom.body : JSON.stringify(custom.body));
            return;
          }

          // Default mock route behaviors
          if (req.method === 'POST' && cleanPath.includes('/messages')) {
            // WhatsApp message dispatch
            const messageId = `wamid.HBgL${Date.now()}`;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                messaging_product: 'whatsapp',
                contacts: [{ input: '+919876543210', wa_id: '919876543210' }],
                messages: [{ id: messageId }],
              }),
            );
            return;
          }

          if (req.method === 'POST' && cleanPath.includes('/message_templates')) {
            // Template creation
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: `template_${Date.now()}`,
                status: 'APPROVED',
                category: 'MARKETING',
              }),
            );
            return;
          }

          if (req.method === 'GET' && cleanPath.includes('/message_templates/')) {
            // Template quality poll
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: 'template_123',
                status: 'APPROVED',
                quality_score: { score: 'GREEN' },
              }),
            );
            return;
          }

          if (req.method === 'PUT' && cleanPath.startsWith('/upload/')) {
            // Cloudflare R2 presigned upload simulation
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('OK');
            return;
          }

          if (req.method === 'GET' && cleanPath.startsWith('/download/')) {
            // Cloudflare R2 presigned download simulation
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(Buffer.from('mock-asset-data'));
            return;
          }

          // Fallback 200
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, path: cleanPath }));
        });
      });

      this.server.listen(port, '127.0.0.1', () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(this.port);
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Sets a custom route handler response.
   */
  public setMockResponse(path: string, status: number, body: unknown): void {
    this.customHandlers.set(path, { status, body });
  }

  /**
   * Toggles simulated failure mode.
   */
  public setSimulatedFailure(shouldFail: boolean, statusCode = 500): void {
    this.simulateFailure = shouldFail;
    this.failureStatusCode = statusCode;
  }

  /**
   * Retrieves all recorded requests, optionally filtered by path substring.
   */
  public getReceivedRequests(filterPath?: string): RecordedRequest[] {
    if (!filterPath) {
      return [...this.recordedRequests];
    }
    return this.recordedRequests.filter((r) => r.path.includes(filterPath));
  }

  /**
   * Retrieves the most recent request.
   */
  public getLastRequest(): RecordedRequest | undefined {
    return this.recordedRequests[this.recordedRequests.length - 1];
  }

  /**
   * Resets recorded requests and custom handlers.
   */
  public reset(): void {
    this.recordedRequests = [];
    this.customHandlers.clear();
    this.simulateFailure = false;
  }

  /**
   * Stops the mock server.
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.port = 0;
        this.reset();
        resolve();
      });
    });
  }
}

export const mockMetaServer = new MockMetaServer();
