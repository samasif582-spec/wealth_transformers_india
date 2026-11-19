import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Formats a list of message logs into Recharts-compatible daily time-series data.
 */
export function buildRechartsTimeSeries(
  logs: Array<{ dispatchedAt: Date; deliveryStatus: string; costInr?: any }>,
  startDate: Date,
  daysCount = 7,
): Array<{
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  costInr: number;
  deliveryRate: number;
  readRate: number;
}> {
  const map = new Map<string, { sent: number; delivered: number; read: number; failed: number; costInr: number }>();

  // Initialize continuous daily intervals
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { sent: 0, delivered: 0, read: 0, failed: 0, costInr: 0 });
  }

  // Populate from logs
  for (const log of logs) {
    if (!log.dispatchedAt) continue;
    const key = (typeof log.dispatchedAt === 'string' ? new Date(log.dispatchedAt) : log.dispatchedAt)
      .toISOString()
      .slice(0, 10);
    if (map.has(key)) {
      const entry = map.get(key)!;
      if (log.deliveryStatus === 'SENT' || log.deliveryStatus === 'DELIVERED' || log.deliveryStatus === 'READ') {
        entry.sent++;
      }
      if (log.deliveryStatus === 'DELIVERED' || log.deliveryStatus === 'READ') {
        entry.delivered++;
      }
      if (log.deliveryStatus === 'READ') {
        entry.read++;
      }
      if (log.deliveryStatus === 'FAILED' || log.deliveryStatus === 'UNDELIVERABLE') {
        entry.failed++;
      }
      if (log.costInr) {
        entry.costInr += Number(log.costInr);
      }
    }
  }

  return Array.from(map.entries()).map(([date, counts]) => {
    const totalSent = counts.sent;
    const deliveryRate = totalSent > 0 ? Math.round((counts.delivered / totalSent) * 10000) / 100 : 0;
    const readRate = totalSent > 0 ? Math.round((counts.read / totalSent) * 10000) / 100 : 0;
    return {
      date,
      ...counts,
      costInr: Math.round(counts.costInr * 100) / 100,
      deliveryRate,
      readRate,
    };
  });
}

/**
 * Generates an RFC 4180 compliant CSV string from campaign summary rows.
 */
export function generateCampaignsCsv(rows: Array<{
  campaignId: string;
  campaignName: string;
  campaignType: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  totalCostInr: number;
}>): string {
  const headers = [
    'Campaign ID',
    'Campaign Name',
    'Type',
    'Status',
    'Total Recipients',
    'Sent',
    'Delivered',
    'Read',
    'Failed',
    'Total Cost (INR)',
  ];

  const escapeField = (val: any): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        escapeField(r.campaignId),
        escapeField(r.campaignName),
        escapeField(r.campaignType),
        escapeField(r.status),
        escapeField(r.totalRecipients),
        escapeField(r.sentCount),
        escapeField(r.deliveredCount),
        escapeField(r.readCount),
        escapeField(r.failedCount),
        escapeField(Number(r.totalCostInr).toFixed(2)),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTimeSeries(startDate: Date, daysCount = 7, campaignId?: string) {
    const where: any = { dispatchedAt: { gte: startDate } };
    if (campaignId) where.campaignId = campaignId;

    const logs = await this.prisma.messageLog.findMany({
      where,
      select: { dispatchedAt: true, deliveryStatus: true, costInr: true },
    });

    return buildRechartsTimeSeries(logs as any, startDate, daysCount);
  }

  async exportCampaignCsv(campaignId: string): Promise<string> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const [totalRecipients, sentCount, deliveredCount, readCount, failedCount, costAgg] = await Promise.all([
      this.prisma.campaignRecipient.count({ where: { campaignId } }),
      this.prisma.messageLog.count({
        where: { campaignId, deliveryStatus: { in: ['SENT', 'DELIVERED', 'READ'] } },
      }),
      this.prisma.messageLog.count({
        where: { campaignId, deliveryStatus: { in: ['DELIVERED', 'READ'] } },
      }),
      this.prisma.messageLog.count({
        where: { campaignId, deliveryStatus: 'READ' },
      }),
      this.prisma.messageLog.count({
        where: { campaignId, deliveryStatus: { in: ['FAILED', 'UNDELIVERABLE'] } },
      }),
      this.prisma.messageLog.aggregate({
        where: { campaignId },
        _sum: { costInr: true },
      }),
    ]);

    return generateCampaignsCsv([
      {
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignType: campaign.campaignType,
        status: campaign.status,
        totalRecipients: totalRecipients || campaign.resolvedRecipientCount || 0,
        sentCount,
        deliveredCount,
        readCount,
        failedCount,
        totalCostInr: Number(costAgg._sum.costInr || campaign.actualCostInr || 0),
      },
    ]);
  }

  async getFailedLogs() {
    return this.prisma.messageLog.findMany({
      where: { deliveryStatus: { in: ['FAILED', 'UNDELIVERABLE'] } },
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { id: true, fullName: true, whatsappNumber: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
  }

  async getQueueStats() {
    const [statusGroups, webhookGroups] = await Promise.all([
      this.prisma.messageLog.groupBy({
        by: ['deliveryStatus'],
        _count: true,
      }),
      this.prisma.webhookEvent.groupBy({
        by: ['processingStatus'],
        _count: true,
      }),
    ]);

    const messageStatusMap: Record<string, number> = {
      QUEUED: 0,
      SENT: 0,
      DELIVERED: 0,
      READ: 0,
      FAILED: 0,
      UNDELIVERABLE: 0,
    };
    statusGroups.forEach((g) => {
      messageStatusMap[g.deliveryStatus] = g._count;
    });

    const webhookStatusMap: Record<string, number> = {
      PENDING: 0,
      PROCESSED: 0,
      FAILED: 0,
    };
    webhookGroups.forEach((g) => {
      webhookStatusMap[g.processingStatus] = g._count;
    });

    return {
      messages: messageStatusMap,
      webhooks: webhookStatusMap,
    };
  }

  async retryFailedLog(id: string) {
    const log = await this.prisma.messageLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException(`Message log ${id} not found`);

    return this.prisma.messageLog.update({
      where: { id },
      data: {
        deliveryStatus: 'QUEUED',
        errorMessage: null,
        errorCode: null,
        retryCount: { increment: 1 },
      },
    });
  }

  async retryAllFailedLogs() {
    return this.prisma.messageLog.updateMany({
      where: { deliveryStatus: { in: ['FAILED', 'UNDELIVERABLE'] } },
      data: {
        deliveryStatus: 'QUEUED',
        errorMessage: null,
        errorCode: null,
      },
    });
  }
}
