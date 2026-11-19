import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ShareReportDto } from './dto/billing.dto';

export interface BillingUsageSummary {
  billingCycle: string;
  cycleStartDate: string;
  cycleEndDate: string;
  monthlyQuota: number;
  totalMessagesSent: number;
  deliveredMessages: number;
  failedMessages: number;
  quotaUsagePercentage: number;
  isOverLimit: boolean;
  overageMessagesCount: number;
  rates: {
    utilityInr: number;
    marketingInr: number;
    serviceInr: number;
    gstRatePercent: number;
  };
  breakdown: {
    utilityCount: number;
    utilityCostInr: number;
    marketingCount: number;
    marketingCostInr: number;
    serviceCount: number;
    serviceCostInr: number;
  };
  financials: {
    basePackageCostInr: number;
    extraCostExclGstInr: number;
    extraGstInr: number;
    totalExtraCostInr: number;
    totalNetInvoiceInr: number;
  };
  alerts: string[];
}

export interface ExtraCostReport {
  reportId: string;
  generatedAt: string;
  companyName: string;
  billingCycle: string;
  hsnSacCode: string;
  usageSummary: BillingUsageSummary;
  campaignAttributions: Array<{
    campaignId: string | null;
    campaignName: string;
    category: string;
    messageCount: number;
    totalCostInr: number;
  }>;
  overLimitDetails: {
    triggered: boolean;
    excessCount: number;
    estimatedExtraCostInr: number;
    recommendedActions: string[];
  };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  // Default rates based on Meta WhatsApp Business Cloud API India schedule
  private readonly UTILITY_RATE = 0.1258;
  private readonly MARKETING_RATE = 0.7854;
  private readonly SERVICE_RATE = 0.35;
  private readonly GST_PERCENT = 18;
  private readonly BASE_PACKAGE_PRICE = 4999.0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Retrieves billing usage and overage status for the given or current month.
   */
  async getUsageOverview(yearMonth?: string): Promise<BillingUsageSummary> {
    const quota = parseInt(
      this.configService.get<string>('MONTHLY_MESSAGE_QUOTA') || '10000',
      10,
    );

    const { startOfMonth, endOfMonth, cycleLabel } = this.resolveDateRange(yearMonth);

    // Query messages dispatched within the billing window
    const logs = await this.prisma.messageLog.findMany({
      where: {
        dispatchedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      select: {
        templateCategory: true,
        deliveryStatus: true,
        pricingRateInr: true,
        costInr: true,
      },
    });

    let utilityCount = 0;
    let marketingCount = 0;
    let serviceCount = 0;
    let deliveredMessages = 0;
    let failedMessages = 0;

    for (const log of logs) {
      if (log.deliveryStatus === 'FAILED') {
        failedMessages++;
      } else {
        deliveredMessages++;
      }

      if (log.templateCategory === 'MARKETING') {
        marketingCount++;
      } else if (log.templateCategory === 'AUTHENTICATION') {
        serviceCount++;
      } else {
        utilityCount++;
      }
    }

    const totalMessagesSent = logs.length;
    const utilityCostInr = Number((utilityCount * this.UTILITY_RATE).toFixed(4));
    const marketingCostInr = Number((marketingCount * this.MARKETING_RATE).toFixed(4));
    const serviceCostInr = Number((serviceCount * this.SERVICE_RATE).toFixed(4));

    const isOverLimit = totalMessagesSent > quota;
    const overageMessagesCount = Math.max(0, totalMessagesSent - quota);
    const quotaUsagePercentage = Math.min(
      100,
      Math.round((totalMessagesSent / quota) * 100),
    );

    // Calculate extra cost if over limit
    let extraCostExclGstInr = 0;
    if (isOverLimit && totalMessagesSent > 0) {
      // Calculate weighted average rate per message dispatched this month
      const totalRawCost = utilityCostInr + marketingCostInr + serviceCostInr;
      const averageRate = totalRawCost / totalMessagesSent;
      extraCostExclGstInr = Number((overageMessagesCount * averageRate).toFixed(2));
    }

    const extraGstInr = Number(
      ((extraCostExclGstInr * this.GST_PERCENT) / 100).toFixed(2),
    );
    const totalExtraCostInr = Number((extraCostExclGstInr + extraGstInr).toFixed(2));
    const totalNetInvoiceInr = Number(
      (this.BASE_PACKAGE_PRICE + totalExtraCostInr).toFixed(2),
    );

    const alerts: string[] = [];
    if (isOverLimit) {
      alerts.push(
        `CRITICAL: WhatsApp conversation quota (${quota.toLocaleString()} messages) exceeded by ${overageMessagesCount.toLocaleString()} messages!`,
      );
      alerts.push(
        `Extra surcharge of ₹${totalExtraCostInr.toLocaleString('en-IN')} (incl. 18% GST) has been added to internal billing.`,
      );
    } else if (quotaUsagePercentage >= 80) {
      alerts.push(
        `WARNING: Reached ${quotaUsagePercentage}% of monthly quota. ${
          quota - totalMessagesSent
        } messages remaining before over-limit extra costs apply.`,
      );
    } else {
      alerts.push(
        `HEALTHY: Plan usage is within allocated quota (${quotaUsagePercentage}% utilized).`,
      );
    }

    return {
      billingCycle: cycleLabel,
      cycleStartDate: startOfMonth.toISOString(),
      cycleEndDate: endOfMonth.toISOString(),
      monthlyQuota: quota,
      totalMessagesSent,
      deliveredMessages,
      failedMessages,
      quotaUsagePercentage,
      isOverLimit,
      overageMessagesCount,
      rates: {
        utilityInr: this.UTILITY_RATE,
        marketingInr: this.MARKETING_RATE,
        serviceInr: this.SERVICE_RATE,
        gstRatePercent: this.GST_PERCENT,
      },
      breakdown: {
        utilityCount,
        utilityCostInr,
        marketingCount,
        marketingCostInr,
        serviceCount,
        serviceCostInr,
      },
      financials: {
        basePackageCostInr: this.BASE_PACKAGE_PRICE,
        extraCostExclGstInr,
        extraGstInr,
        totalExtraCostInr,
        totalNetInvoiceInr,
      },
      alerts,
    };
  }

  /**
   * Prepares the full Extra Cost Report with per-campaign cost breakdown.
   */
  async getDetailedExtraCostReport(yearMonth?: string): Promise<ExtraCostReport> {
    const summary = await this.getUsageOverview(yearMonth);
    const { startOfMonth, endOfMonth } = this.resolveDateRange(yearMonth);

    // Group costs by campaign
    const campaignLogs = await this.prisma.messageLog.groupBy({
      by: ['campaignId', 'templateCategory'],
      where: {
        dispatchedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _count: {
        id: true,
      },
    });

    // Fetch campaign titles
    const campaignIds = campaignLogs
      .map((c) => c.campaignId)
      .filter((id): id is string => Boolean(id));

    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, name: true },
    });

    const campaignMap = new Map<string, string>();
    for (const c of campaigns) {
      campaignMap.set(c.id, c.name);
    }

    const campaignAttributions = campaignLogs.map((group) => {
      const count = group._count.id;
      const rate =
        group.templateCategory === 'MARKETING'
          ? this.MARKETING_RATE
          : group.templateCategory === 'AUTHENTICATION'
          ? this.SERVICE_RATE
          : this.UTILITY_RATE;

      const campaignName = group.campaignId
        ? campaignMap.get(group.campaignId) || 'Automated Campaign'
        : 'Automated Lifecycle (Birthday/Anniversary/System)';

      return {
        campaignId: group.campaignId,
        campaignName,
        category: group.templateCategory,
        messageCount: count,
        totalCostInr: Number((count * rate).toFixed(2)),
      };
    });

    const recommendedActions: string[] = [];
    if (summary.isOverLimit) {
      recommendedActions.push(
        'Upgrade to Enterprise Tier 2 (25,000 monthly messages) to reduce per-message cost by 15%.',
      );
      recommendedActions.push(
        'Audit marketing broadcast audiences to suppress unengaged client numbers.',
      );
      recommendedActions.push(
        'Submit invoice requisition to Internal Accounts for WhatsApp over-limit settlement.',
      );
    } else {
      recommendedActions.push(
        'Current traffic patterns are optimal and well within allocated plan budget.',
      );
    }

    return {
      reportId: `RPT-WT-${Date.now().toString(36).toUpperCase()}`,
      generatedAt: new Date().toISOString(),
      companyName: 'Wealth Transformers India Pvt Ltd',
      billingCycle: summary.billingCycle,
      hsnSacCode: '998413', // Telecommunications and messaging services
      usageSummary: summary,
      campaignAttributions,
      overLimitDetails: {
        triggered: summary.isOverLimit,
        excessCount: summary.overageMessagesCount,
        estimatedExtraCostInr: summary.financials.totalExtraCostInr,
        recommendedActions,
      },
    };
  }

  /**
   * Dispatches the Extra Cost Report to the designated internal team.
   */
  async shareReportWithInternalTeam(dto: ShareReportDto) {
    const report = await this.getDetailedExtraCostReport(dto.billingCycle);

    this.logger.log(
      `Dispatching extra cost report [${report.reportId}] for cycle ${report.billingCycle} to internal team: ${dto.recipients.join(
        ', ',
      )}`,
    );

    // In production, integrate email service / Slack / internal ticket
    return {
      success: true,
      reportId: report.reportId,
      dispatchedAt: new Date().toISOString(),
      recipients: dto.recipients,
      summary: {
        billingCycle: report.billingCycle,
        isOverLimit: report.usageSummary.isOverLimit,
        totalMessagesSent: report.usageSummary.totalMessagesSent,
        extraCostInr: report.usageSummary.financials.totalExtraCostInr,
      },
      message: `Extra cost report successfully generated and transmitted to ${dto.recipients.length} internal team stakeholder(s).`,
    };
  }

  /**
   * Resolves first and last moment of the given billing month.
   */
  private resolveDateRange(yearMonth?: string): {
    startOfMonth: Date;
    endOfMonth: Date;
    cycleLabel: string;
  } {
    let year: number;
    let month: number; // 0-indexed

    if (yearMonth && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [y, m] = yearMonth.split('-').map(Number);
      year = y;
      month = m - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
    }

    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    // Last day of month
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const cycleLabel = `${monthNames[month]} ${year}`;

    return { startOfMonth, endOfMonth, cycleLabel };
  }
}
