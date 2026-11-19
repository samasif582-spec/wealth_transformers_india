import request, { SuperTest, Test } from 'supertest';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export class ApiClient {
  public readonly serverUrl: string;
  public readonly apiPrefix: string;
  private token?: string;
  private customHeaders: Record<string, string> = {};

  constructor(serverUrl = 'http://127.0.0.1:3000', apiPrefix = '/api/v1') {
    this.serverUrl = serverUrl;
    this.apiPrefix = apiPrefix;
  }

  /** Clone client with an Authorization Bearer token */
  public withToken(token: string): ApiClient {
    const clone = new ApiClient(this.serverUrl, this.apiPrefix);
    clone.token = token;
    clone.customHeaders = { ...this.customHeaders };
    return clone;
  }

  /** Clone client with custom headers */
  public withHeader(name: string, value: string): ApiClient {
    const clone = new ApiClient(this.serverUrl, this.apiPrefix);
    clone.token = this.token;
    clone.customHeaders = { ...this.customHeaders, [name]: value };
    return clone;
  }

  /** Clone client with X-Internal-Api-Key header */
  public withInternalApiKey(key = process.env.INTERNAL_API_SECRET || 'e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6'): ApiClient {
    return this.withHeader('X-Internal-Api-Key', key);
  }

  /** Access raw supertest agent */
  public raw(): any {
    return request(this.serverUrl);
  }

  /** Resolve full path including API prefix */
  private resolvePath(endpoint: string): string {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    if (cleanEndpoint.startsWith(this.apiPrefix)) {
      return cleanEndpoint;
    }
    return `${this.apiPrefix}${cleanEndpoint}`;
  }

  /** Apply headers (Authorization, custom headers) to supertest Test request */
  private applyHeaders(req: Test): Test {
    if (this.token) {
      req.set('Authorization', `Bearer ${this.token}`);
    }
    for (const [key, value] of Object.entries(this.customHeaders)) {
      req.set(key, value);
    }
    return req;
  }

  /** HTTP GET */
  public get(endpoint: string, query?: Record<string, unknown>): Test {
    const fullPath = this.resolvePath(endpoint);
    let req = request(this.serverUrl).get(fullPath);
    req = this.applyHeaders(req);
    if (query) {
      req = req.query(query);
    }
    return req;
  }

  /** HTTP POST */
  public post(endpoint: string, body?: unknown): Test {
    const fullPath = this.resolvePath(endpoint);
    let req = request(this.serverUrl).post(fullPath);
    req = this.applyHeaders(req);
    if (body !== undefined) {
      req = req.send(body as any);
    }
    return req;
  }

  /** HTTP PUT */
  public put(endpoint: string, body?: unknown): Test {
    const fullPath = this.resolvePath(endpoint);
    let req = request(this.serverUrl).put(fullPath);
    req = this.applyHeaders(req);
    if (body !== undefined) {
      req = req.send(body as any);
    }
    return req;
  }

  /** HTTP PATCH */
  public patch(endpoint: string, body?: unknown): Test {
    const fullPath = this.resolvePath(endpoint);
    let req = request(this.serverUrl).patch(fullPath);
    req = this.applyHeaders(req);
    if (body !== undefined) {
      req = req.send(body as any);
    }
    return req;
  }

  /** HTTP DELETE */
  public delete(endpoint: string): Test {
    const fullPath = this.resolvePath(endpoint);
    let req = request(this.serverUrl).delete(fullPath);
    return this.applyHeaders(req);
  }

  /** Multipart File Upload */
  public upload(endpoint: string, fieldName: string, file: string | Buffer, filename = 'test-file.csv'): Test {
    const fullPath = this.resolvePath(endpoint);
    let req = request(this.serverUrl).post(fullPath);
    req = this.applyHeaders(req);
    if (typeof file === 'string') {
      req = req.attach(fieldName, file);
    } else {
      req = req.attach(fieldName, file, filename);
    }
    return req;
  }
}

export const apiClient = new ApiClient();
