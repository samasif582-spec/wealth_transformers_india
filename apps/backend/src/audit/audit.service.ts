import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditActionType, UserRole } from '@prisma/client';

export interface CreateAuditLogDto {
  actorId?: string;
  actorRole?: UserRole;
  actionType: AuditActionType;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: CreateAuditLogDto): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          ...entry,
          beforeState: entry.beforeState as any,
          afterState: entry.afterState as any,
          metadata: entry.metadata as any,
        },
      });
    } catch (err) {
      // Audit log failures must never break business operations
      this.logger.error('Failed to write audit log entry', err);
    }
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    actorId?: string;
    actionType?: string;
    resourceType?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.actionType) where.actionType = query.actionType;
    if (query.resourceType) where.resourceType = query.resourceType;

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }
}
