import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditActionType, UserRole } from '@prisma/client';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetaMessagesAdapter } from '../templates/meta-messages.adapter';

export interface WhatsAppHealthStatus {
  status: 'HEALTHY' | 'DEGRADED' | 'UNCONFIGURED';
  dispatchMode: 'mock' | 'virtualized' | 'canary' | 'live';
  isMockMode: boolean;
  complianceVerified: boolean;
  circuitBreakerActive: boolean;
  metaConfig: {
    graphApiVersion: string;
    hasAccessToken: boolean;
    hasPhoneNumberId: boolean;
    hasWabaId: boolean;
    hasVerifyToken: boolean;
    hasAppSecret: boolean;
  };
  connectivity: {
    metaReachable: boolean;
    latencyMs?: number;
    error?: string;
  };
  queue: {
    redisConnected: boolean;
  };
  timestamp: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly metaAdapter: MetaMessagesAdapter,
  ) {}

  /**
   * Health check diagnostic for Meta WhatsApp Business Cloud API integration.
   */
  async getWhatsAppHealth(): Promise<WhatsAppHealthStatus> {
    const redisClient = this.redis.getClient();
    const isPaused = (await redisClient.get('whatsapp:circuit_breaker:paused')) === 'true';
    const isComplianceVerified =
      (await redisClient.get('whatsapp:compliance_verified')) === 'true' ||
      this.config.get<string>('COMPLIANCE_VERIFIED') === 'true';

    const dispatchMode = (
      this.config.get<string>('DISPATCH_MODE') || 'mock'
    ).toLowerCase() as 'mock' | 'virtualized' | 'canary' | 'live';

    const hasAccessToken = Boolean(this.config.get<string>('META_ACCESS_TOKEN'));
    const hasPhoneNumberId = Boolean(this.config.get<string>('META_PHONE_NUMBER_ID'));
    const hasWabaId = Boolean(this.config.get<string>('META_WABA_ID'));
    const hasVerifyToken = Boolean(this.config.get<string>('META_VERIFY_TOKEN'));
    const hasAppSecret = Boolean(this.config.get<string>('META_APP_SECRET'));

    let metaReachable = false;
    let latencyMs = 0;
    let connectivityError: string | undefined;

    if (this.metaAdapter.isMockMode) {
      metaReachable = true;
      latencyMs = 5;
    } else {
      const start = Date.now();
      try {
        const res = await fetch(
          `${this.metaAdapter.baseGraphUrl}/${this.metaAdapter.graphApiVersion}/${this.metaAdapter.phoneNumberId}`,
          {
            headers: {
              Authorization: `Bearer ${this.metaAdapter.metaToken}`,
            },
            signal: AbortSignal.timeout(5000),
          },
        );
        latencyMs = Date.now() - start;
        metaReachable = res.ok;
        if (!res.ok) {
          connectivityError = `HTTP ${res.status}: ${res.statusText}`;
        }
      } catch (err: any) {
        latencyMs = Date.now() - start;
        connectivityError = err.message;
      }
    }

    const isHealthy =
      hasPhoneNumberId && hasWabaId && (this.metaAdapter.isMockMode || metaReachable);

    return {
      status: isPaused ? 'DEGRADED' : isHealthy ? 'HEALTHY' : 'UNCONFIGURED',
      dispatchMode,
      isMockMode: this.metaAdapter.isMockMode,
      complianceVerified: isComplianceVerified,
      circuitBreakerActive: isPaused,
      metaConfig: {
        graphApiVersion: this.metaAdapter.graphApiVersion,
        hasAccessToken,
        hasPhoneNumberId,
        hasWabaId,
        hasVerifyToken,
        hasAppSecret,
      },
      connectivity: {
        metaReachable,
        latencyMs,
        error: connectivityError,
      },
      queue: {
        redisConnected: redisClient.status === 'ready',
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Dispatches a controlled canary test message to a verified operator/admin phone number.
   */
  async testCanaryDispatch(body: {
    testPhoneNumber: string;
    templateName?: string;
    messageText?: string;
  }) {
    const redisClient = this.redis.getClient();
    const isPaused = (await redisClient.get('whatsapp:circuit_breaker:paused')) === 'true';
    if (isPaused) {
      throw new BadRequestException('Emergency circuit breaker is currently ACTIVE. Outbound messaging is paused.');
    }

    const phone = body.testPhoneNumber.trim();
    if (!phone || phone.length < 10) {
      throw new BadRequestException('Invalid test phone number. Must be valid 10+ digits.');
    }

    const text =
      body.messageText ||
      `[CANARY TEST] Wealth Transformers India Pvt Ltd — Verification dispatch at ${new Date().toLocaleTimeString()} IST. System operational.`;

    this.logger.log(`Executing canary test message to ${phone}`);
    const result = await this.metaAdapter.sendTextMessage(phone, text);

    return {
      success: result.success,
      wamid: result.wamid,
      mockMode: result.mockMode,
      targetPhone: phone,
      dispatchedAt: new Date().toISOString(),
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    };
  }

  /**
   * Emergency circuit breaker: Immediately pauses all outbound WhatsApp dispatch.
   */
  async emergencyPause(reason: string, adminEmail: string) {
    const redisClient = this.redis.getClient();
    await redisClient.set('whatsapp:circuit_breaker:paused', 'true');

    this.logger.error(`🚨 EMERGENCY CIRCUIT BREAKER ACTIVATED by ${adminEmail}. Reason: ${reason}`);

    await this.prisma.auditLog.create({
      data: {
        actionType: AuditActionType.SETTINGS_CHANGE,
        resourceType: 'System',
        actorRole: UserRole.Super_Admin,
        ipAddress: '127.0.0.1',
        metadata: {
          action: 'EMERGENCY_CIRCUIT_BREAKER_TRIGGERED',
          actorEmail: adminEmail,
          reason,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      paused: true,
      message: 'Emergency pause activated. All BullMQ and automated WhatsApp dispatch jobs are now held in quarantine.',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Resumes outbound dispatch after emergency resolution.
   */
  async resumeDispatch(adminEmail: string) {
    const redisClient = this.redis.getClient();
    await redisClient.del('whatsapp:circuit_breaker:paused');

    this.logger.log(`✅ Emergency circuit breaker cleared by ${adminEmail}. Outbound dispatch resumed.`);

    await this.prisma.auditLog.create({
      data: {
        actionType: AuditActionType.SETTINGS_CHANGE,
        resourceType: 'System',
        actorRole: UserRole.Super_Admin,
        ipAddress: '127.0.0.1',
        metadata: {
          action: 'EMERGENCY_CIRCUIT_BREAKER_CLEARED',
          actorEmail: adminEmail,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return {
      paused: false,
      message: 'Outbound dispatch resumed successfully.',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Authorizes live delivery compliance verification flag.
   */
  async verifyCompliance(adminEmail: string, acknowledgedRisk: boolean) {
    if (!acknowledgedRisk) {
      throw new BadRequestException('Compliance acknowledgment is mandatory before verifying live delivery.');
    }

    const redisClient = this.redis.getClient();
    await redisClient.set('whatsapp:compliance_verified', 'true');

    await this.prisma.auditLog.create({
      data: {
        actionType: AuditActionType.SETTINGS_CHANGE,
        resourceType: 'System',
        actorRole: UserRole.Super_Admin,
        ipAddress: '127.0.0.1',
        metadata: {
          action: 'PRODUCTION_COMPLIANCE_VERIFIED',
          actorEmail: adminEmail,
          acknowledgedRisk,
          verifiedAt: new Date().toISOString(),
        },
      },
    });

    return {
      complianceVerified: true,
      message: 'Live WhatsApp delivery compliance authorization recorded.',
    };
  }
}
