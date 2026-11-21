import React, { useState, useEffect } from 'react';
import {
  Receipt,
  AlertTriangle,
  CheckCircle2,
  Share2,
  TrendingUp,
  Download,
  IndianRupee,
  RefreshCw,
  Mail,
  ShieldAlert,
  Send,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { StatsCard } from '../../components/ui/StatsCard';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface BillingUsage {
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

interface ExtraCostReport {
  reportId: string;
  generatedAt: string;
  companyName: string;
  billingCycle: string;
  hsnSacCode: string;
  usageSummary: BillingUsage;
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

export const BillingPage: React.FC = () => {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [report, setReport] = useState<ExtraCostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([
    'finance@wealthtransformers.in',
    'operations@wealthtransformers.in',
  ]);
  const [additionalEmail, setAdditionalEmail] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [sendingShare, setSendingShare] = useState(false);

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [usageRes, reportRes] = await Promise.allSettled([
        apiClient.get('/billing/usage'),
        apiClient.get('/billing/extra-cost-report'),
      ]);

      if (usageRes.status === 'fulfilled') {
        setUsage(usageRes.value.data);
      }
      if (reportRes.status === 'fulfilled') {
        setReport(reportRes.value.data);
      }
    } catch (err: any) {
      toast.error('Failed to load billing metrics', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const handleShareReport = async () => {
    try {
      setSendingShare(true);
      const finalRecipients = [...recipients];
      if (additionalEmail.trim() && !finalRecipients.includes(additionalEmail.trim())) {
        finalRecipients.push(additionalEmail.trim());
      }

      const res = await apiClient.post('/billing/share-report', {
        recipients: finalRecipients,
        customMessage: customNote,
        billingCycle: usage?.billingCycle,
      });

      toast.success(
        'Report Shared Successfully',
        res.data.message || 'Dispatched to internal management.',
      );
      setIsShareModalOpen(false);
      setCustomNote('');
      setAdditionalEmail('');
    } catch (err: any) {
      toast.error('Share Failed', err.response?.data?.message || err.message);
    } finally {
      setSendingShare(false);
    }
  };

  const toggleRecipient = (email: string) => {
    setRecipients((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  if (loading && !usage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm font-medium text-slate-500">
            Calculating WhatsApp conversation costs & limits...
          </p>
        </div>
      </div>
    );
  }

  const isOver = usage?.isOverLimit ?? false;
  const quotaUsedPct = usage?.quotaUsagePercentage ?? 0;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Bills & WhatsApp Usage
            </h1>
            <Badge variant={isOver ? 'danger' : 'success'}>
              {isOver ? 'Limit Exceeded' : 'Within Quota'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time conversation tier accounting, over-limit extra cost tracking, and internal team reporting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchBillingData()}
            className="apple-btn-secondary"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="apple-btn-primary"
          >
            <Share2 className="w-4 h-4" />
            Send Report to Internal Team
          </button>
        </div>
      </div>

      {/* Over-Limit / Within Quota Banner */}
      {isOver ? (
        <div className="p-5 rounded-[24px] bg-rose-500/10 border border-rose-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-[14px] bg-rose-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-rose-800 dark:text-rose-200">
                Monthly Conversation Limit Exceeded!
              </h3>
              <p className="text-sm text-rose-700/90 dark:text-rose-300/90 mt-1">
                Your account exceeded the allocated plan quota of{' '}
                <span className="font-semibold">
                  {usage?.monthlyQuota.toLocaleString()} messages
                </span>{' '}
                by{' '}
                <span className="font-semibold underline">
                  {usage?.overageMessagesCount.toLocaleString()} extra messages
                </span>
                . Surcharges are being calculated at WhatsApp Tier rates.
              </p>
              <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-rose-800 dark:text-rose-200">
                <span>Extra Cost: ₹{usage?.financials.extraCostExclGstInr.toLocaleString('en-IN')}</span>
                <span>•</span>
                <span>GST (18%): ₹{usage?.financials.extraGstInr.toLocaleString('en-IN')}</span>
                <span>•</span>
                <span className="underline">Total Extra: ₹{usage?.financials.totalExtraCostInr.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="apple-btn-primary shrink-0 self-start md:self-center"
          >
            Notify Internal Team Now
          </button>
        </div>
      ) : (
        <div className="p-5 rounded-[24px] bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                WhatsApp Traffic Within Monthly Quota ({quotaUsedPct}% Consumed)
              </h3>
              <p className="text-xs text-emerald-700/90 dark:text-emerald-400 mt-0.5">
                {(usage?.monthlyQuota || 10000) - (usage?.totalMessagesSent || 0)} messages remaining in your base plan package before any extra cost is incurred.
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Cycle: {usage?.billingCycle}
          </span>
        </div>
      )}

      {/* Quota Progress Bar */}
      <div className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl p-6 rounded-[26px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Monthly Quota Utilization
          </span>
          <span className="font-mono font-bold text-slate-900 dark:text-white">
            {usage?.totalMessagesSent.toLocaleString()} / {usage?.monthlyQuota.toLocaleString()} messages ({quotaUsedPct}%)
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isOver
                ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                : quotaUsedPct >= 80
                ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
            }`}
            style={{ width: `${Math.min(100, quotaUsedPct)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Billing Cycle: {usage?.billingCycle}</span>
          <span>Resets on: 1st of next month</span>
        </div>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard
          title="Total Messages Dispatched"
          value={usage?.totalMessagesSent.toLocaleString() || '0'}
          subtitle={`${usage?.deliveredMessages || 0} delivered, ${usage?.failedMessages || 0} failed`}
          icon={<Send className="w-5 h-5 text-emerald-500" />}
        />
        <StatsCard
          title="Base Monthly Package"
          value={`₹${(usage?.financials.basePackageCostInr || 4999).toLocaleString('en-IN')}`}
          subtitle="Fixed infrastructure & quota allotment"
          icon={<Building2 className="w-5 h-5 text-blue-500" />}
        />
        <StatsCard
          title="Extra Cost Incurred"
          value={`₹${(usage?.financials.totalExtraCostInr || 0).toLocaleString('en-IN')}`}
          subtitle={isOver ? `${usage?.overageMessagesCount} overage msgs + 18% GST` : 'Zero overage incurred'}
          icon={<IndianRupee className="w-5 h-5 text-amber-500" />}
        />
        <StatsCard
          title="Total Net Billable"
          value={`₹${(usage?.financials.totalNetInvoiceInr || 4999).toLocaleString('en-IN')}`}
          subtitle="Current month total payable"
          icon={<Receipt className="w-5 h-5 text-purple-500" />}
        />
      </div>

      {/* Conversation Tier Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl p-6 rounded-[24px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Utility Tier
            </span>
            <Badge variant="info">₹{usage?.rates.utilityInr}/msg</Badge>
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {usage?.breakdown.utilityCount.toLocaleString() || 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Birthdays, Anniversaries, OTPs, Status</p>
          </div>
          <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Category Cost</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              ₹{usage?.breakdown.utilityCostInr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl p-6 rounded-[24px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Marketing Tier
            </span>
            <Badge variant="purple">₹{usage?.rates.marketingInr}/msg</Badge>
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {usage?.breakdown.marketingCount.toLocaleString() || 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Offers, Festivals, Broadcasts</p>
          </div>
          <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Category Cost</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              ₹{usage?.breakdown.marketingCostInr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl p-6 rounded-[24px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Service Tier
            </span>
            <Badge variant="success">₹{usage?.rates.serviceInr}/msg</Badge>
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {usage?.breakdown.serviceCount.toLocaleString() || 0}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Inbound replies & support inquiries</p>
          </div>
          <div className="pt-3 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Category Cost</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              ₹{usage?.breakdown.serviceCostInr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Campaign Attributions Table */}
      <div className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl rounded-[28px] border border-black/5 dark:border-white/10 overflow-hidden shadow-apple-card dark:shadow-apple-card-dark">
        <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Campaign Cost Attribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Breakdown of message volume and WhatsApp cost per initiative.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-black/5 dark:bg-white/5 rounded-full text-slate-600 dark:text-slate-300 border border-black/5 dark:border-white/10">
            SAC Code 998413
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-3.5">Campaign Name</th>
                <th className="px-6 py-3.5">Category</th>
                <th className="px-6 py-3.5 text-right">Messages</th>
                <th className="px-6 py-3.5 text-right">Estimated Cost (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {report?.campaignAttributions && report.campaignAttributions.length > 0 ? (
                report.campaignAttributions.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                      {c.campaignName}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.category === 'MARKETING'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                        }`}
                      >
                        {c.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-medium">
                      {c.messageCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      ₹{c.totalCostInr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400 dark:text-slate-500 italic">
                    No campaigns dispatched in this cycle yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Share Report Modal */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500 text-white">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Send Report to Internal Team
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Transmits consumption and over-limit extra cost breakdown.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Select Internal Stakeholders
                </label>
                <div className="space-y-2">
                  {['finance@wealthtransformers.in', 'operations@wealthtransformers.in', 'director@wealthtransformers.in'].map((email) => (
                    <label
                      key={email}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={recipients.includes(email)}
                        onChange={() => toggleRecipient(email)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {email}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Add Additional Email
                </label>
                <input
                  type="email"
                  value={additionalEmail}
                  onChange={(e) => setAdditionalEmail(e.target.value)}
                  placeholder="team.member@wealthtransformers.in"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Custom Notes (Optional)
                </label>
                <textarea
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  rows={3}
                  placeholder="E.g. Extra festival campaigns generated higher engagement than budgeted. Please review additional invoice allocation."
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden resize-none"
                />
              </div>

              {isOver && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  <span className="font-bold">Over-Limit Warning:</span> An extra surcharge of ₹{usage?.financials.totalExtraCostInr.toLocaleString('en-IN')} will be highlighted in red on the generated report.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/5 dark:border-white/5">
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="apple-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleShareReport}
                disabled={sendingShare || recipients.length === 0}
                className="apple-btn-primary"
              >
                {sendingShare ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {sendingShare ? 'Transmitting...' : 'Dispatch Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
