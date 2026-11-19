import * as jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ApiClient } from './api-client';
import { USER_CREDENTIALS, TEST_USERS, UserRoleKey } from '../fixtures/users.fixture';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  jti: string;
  refreshJti: string;
}

export interface TokenOptions {
  userId?: string;
  role?: UserRoleKey;
  expiresInSeconds?: number;
  jti?: string;
  extraClaims?: Record<string, unknown>;
}

export class AuthHelper {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private tokenCache: Map<string, AuthTokens> = new Map();

  constructor() {
    const privKeyRaw = process.env.JWT_PRIVATE_KEY || '';
    const pubKeyRaw = process.env.JWT_PUBLIC_KEY || '';

    this.privateKey = privKeyRaw ? Buffer.from(privKeyRaw, 'base64').toString('utf-8') : '';
    this.publicKey = pubKeyRaw ? Buffer.from(pubKeyRaw, 'base64').toString('utf-8') : '';
    this.accessTtl = parseInt(process.env.JWT_ACCESS_TOKEN_TTL || '900', 10);
    this.refreshTtl = parseInt(process.env.JWT_REFRESH_TOKEN_TTL || '604800', 10);
  }

  /**
   * Generates a cryptographically valid RS256 JWT token using the platform's private key.
   * Matches NestJS JwtStrategy verification logic.
   */
  public generateAccessToken(options: TokenOptions = {}): { token: string; jti: string } {
    const role = options.role || 'Super_Admin';
    const userId = options.userId || TEST_USERS[role]?.id || uuidv4();
    const jti = options.jti || uuidv4();
    const expiresIn = options.expiresInSeconds ?? this.accessTtl;

    const payload = {
      sub: userId,
      role,
      jti,
      ...options.extraClaims,
    };

    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn,
    });

    return { token, jti };
  }

  /**
   * Generates a cryptographically valid RS256 refresh token.
   */
  public generateRefreshToken(options: TokenOptions = {}): { token: string; jti: string } {
    const role = options.role || 'Super_Admin';
    const userId = options.userId || TEST_USERS[role]?.id || uuidv4();
    const jti = options.jti || uuidv4();
    const expiresIn = options.expiresInSeconds ?? this.refreshTtl;

    const payload = {
      sub: userId,
      role,
      jti,
      type: 'refresh',
      ...options.extraClaims,
    };

    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn,
    });

    return { token, jti };
  }

  /**
   * Generates a pair of access and refresh tokens.
   */
  public generateTokenPair(role: UserRoleKey = 'Super_Admin', userId?: string): AuthTokens {
    const effectiveUserId = userId || TEST_USERS[role]?.id || uuidv4();
    const { token: accessToken, jti } = this.generateAccessToken({ role, userId: effectiveUserId });
    const { token: refreshToken, jti: refreshJti } = this.generateRefreshToken({ role, userId: effectiveUserId });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtl,
      jti,
      refreshJti,
    };
  }

  /**
   * Authenticates against the live API, or falls back to authentic RS256 token generation.
   */
  public async getTokensForRole(role: UserRoleKey, forceFresh = false): Promise<AuthTokens> {
    if (!forceFresh && this.tokenCache.has(role)) {
      return this.tokenCache.get(role)!;
    }

    const credentials = USER_CREDENTIALS[role];
    const client = new ApiClient();

    try {
      const res = await client.post('/auth/login', {
        email: credentials.email,
        password: credentials.password,
      });

      if (res.status === 200 && res.body && res.body.accessToken) {
        const tokens: AuthTokens = {
          accessToken: res.body.accessToken,
          refreshToken: res.body.refreshToken || '',
          expiresIn: res.body.expiresIn || this.accessTtl,
          jti: uuidv4(),
          refreshJti: uuidv4(),
        };
        this.tokenCache.set(role, tokens);
        return tokens;
      }
    } catch {
      // In early milestones where login endpoint is still a stub, fallback to RS256 key signing
    }

    // Generate genuine tokens signed with platform private key
    const tokens = this.generateTokenPair(role, TEST_USERS[role]?.id);
    this.tokenCache.set(role, tokens);
    return tokens;
  }

  /**
   * Returns an ApiClient pre-configured with the Bearer token for the requested role.
   */
  public async getAuthenticatedClient(role: UserRoleKey): Promise<ApiClient> {
    const tokens = await this.getTokensForRole(role);
    return new ApiClient().withToken(tokens.accessToken);
  }

  /**
   * Decodes a JWT token without verification.
   */
  public decodeToken(token: string): jwt.JwtPayload | string | null {
    return jwt.decode(token);
  }

  /**
   * Verifies a JWT token with the public key.
   */
  public verifyToken(token: string): jwt.JwtPayload | string {
    return jwt.verify(token, this.publicKey, { algorithms: ['RS256'] });
  }

  /**
   * Clears token cache.
   */
  public clearCache(): void {
    this.tokenCache.clear();
  }
}

export const authHelper = new AuthHelper();
