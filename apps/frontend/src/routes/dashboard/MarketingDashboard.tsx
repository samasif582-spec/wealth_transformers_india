import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  FileText,
  Users,
  TrendingUp,
  CheckCircle,
  Eye,
  PlusCircle,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { StatsCard } from '../../components/ui/StatsCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface CampaignItem {
  id: string;
  name: string;
  campaignType: string;
  status: string;
  resolvedRecipientCount: number;
  scheduledAt?: string | null;
  createdAt: string;
  template?: {
    id: string;
    name: string;
    category: string;
  };
  _count?: {
    recipients: number;
    messageLogs: number;
  };
}

export const MarketingDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [campaignsTotal, setCampaignsTotal] = useState<number>(0);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [templatesCount, setTemplatesCount] = useState<number>(0);
  const [greenTemplatesCount, setGreenTemplatesCount] = useState<number>(0);
  const [optedInAudience, setOptedInAudience] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMarketingData = async () => {
    try {
      setLoading(true);
      const [campaignsRes, templatesRes, statsRes] = await Promise.allSettled([
        apiClient.get('/campaigns?limit=10'),
        apiClient.get('/templates?limit=50'),
        apiClient.get('/clients/stats'),
      ]);

      if (campaignsRes.status === 'fulfilled') {
        const cData = campaignsRes.value.data;
        const list: CampaignItem[] = Array.isArray(cData) ? cData : cData.data || [];
        setCampaigns(list);
        setCampaignsTotal(cData.total || list.length);
        const active = list.filter((c) => c.status === 'EXECUTING' || c.status === 'RUNNING' || c.status === 'APPROVED').length;
        setActiveCount(active);
      }

      if (templatesRes.status === 'fulfilled') {
        const tData = templatesRes.value.data;
        const list = Array.isArray(tData) ? tData : tData.data || [];
        setTemplatesCount(tData.total || list.length);
        const green = list.filter((t: any) => t.qualityRating === 'GREEN' || t.status === 'APPROVED').length;
        setGreenTemplatesCount(green);
      }

      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value.data;
        const byConsent = s.byConsent || [];
        const optedIn = byConsent.find((item: any) => item.status === 'OPTED_IN')?.count || 0;
        setOptedInAudience(optedIn);
      }
    } catch (err: any) {
      toast.error('Sync Error', err.message || 'Failed to fetch marketing metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketingData();
  }, []);

  const columns: Column<CampaignItem>[] = [
    {
      key: 'name',
      header: 'Campaign Name',
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">ID: {c.id.slice(0, 8)}... | {c.template?.name || 'Meta Template'}</p>
        </div>
      ),
    },
    {
      key: 'campaignType',
      header: 'Category',
      render: (c) => {
        const variants: Record<string, any> = {
          PROMOTIONAL: 'info',
          FESTIVAL: 'purple',
          BIRTHDAY: 'success',
          ANNIVERSARY: 'cyan',
          SERVICE_NOTIFICATION: 'default',
        };
        return <Badge variant={variants[c.campaignType] ?? 'default'}>{c.campaignType}</Badge>;
      },
    },
    {
      key: 'resolvedRecipientCount',
      header: 'Audience Eligible (P1)',
      render: (c) => (
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {(c.resolvedRecipientCount || c._count?.recipients || 0).toLocaleString()} clients
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Lifecycle Status',
      render: (c) => {
        const variants: Record<string, any> = {
          COMPLETED: 'success',
          EXECUTING: 'info',
          RUNNING: 'info',
          APPROVED: 'success',
          PENDING_APPROVAL: 'warning',
          PAUSED: 'default',
          DRAFT: 'default',
          REJECTED: 'danger',
          CANCELLED: 'danger',
        };
        return (
          <Badge variant={variants[c.status] ?? 'default'}>
            {c.status}
          </Badge>
        );
      },
    },
    {
      key: 'createdAt',
      header: 'Created / Scheduled',
      render: (c) => (
        <span className="text-xs text-slate-500 font-mono">
          {c.scheduledAt
            ? new Date(c.scheduledAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
            : new Date(c.createdAt).toLocaleDateString('en-IN')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <button
          onClick={() => navigate(`/campaigns/${c.id}`)}
          className="flex items-center gap-1 px-2.5 py-1 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-xs font-semibold transition-colors"
        >
          <Eye className="w-3.5 h-3.5" /> Details
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Campaign Growth Center</h1>
            <Badge variant="success">Marketing_Employee</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Design targeted campaigns, manage Meta WhatsApp templates & evaluate engagement analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchMarketingData}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/campaigns/new')}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-md hover:shadow-lg transition-all"
          >
            <PlusCircle className="w-4 h-4" /> New Campaign Wizard
          </button>
        </div>
      </div>

      {/* Quick Launchpad Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => navigate('/campaigns/new')}
          className="p-5 text-left bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-sm hover:shadow-md transition-all group"
        >
          <div className="p-2.5 bg-white/20 rounded-xl w-fit mb-4">
            <Send className="w-6 h-6 text-white" />
          </div>
          <h3 className="font-bold text-base group-hover:translate-x-0.5 transition-transform">
            5-Step Campaign Wizard
          </h3>
          <p className="text-xs text-blue-100 mt-1">
            Build audience filters, pick verified templates & preview
          </p>
        </button>

        <button
          onClick={() => navigate('/templates')}
          className="p-5 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-sm transition-all group"
        >
          <div className="p-2.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl w-fit mb-4">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            Meta Templates ({templatesCount})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            SEBI compliant templates with dynamic variable placeholders
          </p>
        </button>

        <button
          onClick={() => navigate('/clients/import')}
          className="p-5 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-sm transition-all group"
        >
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Import Clients CSV
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Bulk client onboarding with automated phone normalization
          </p>
        </button>

        <button
          onClick={() => navigate('/analytics')}
          className="p-5 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-sm transition-all group"
        >
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl w-fit mb-4">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
            Performance ROI
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Read rate insights, cost per conversation & delivery audit
          </p>
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Campaigns Created"
          value={loading ? '...' : campaignsTotal.toString()}
          change={`${activeCount} active`}
          changeType={activeCount > 0 ? 'positive' : 'neutral'}
          icon={<Send className="w-5 h-5" />}
          color="blue"
        />
        <StatsCard
          title="Reachable Audience"
          value={loading ? '...' : optedInAudience.toLocaleString()}
          subtitle="Opted-in verified clients (P1)"
          icon={<Users className="w-5 h-5" />}
          color="emerald"
        />
        <StatsCard
          title="Verified Templates"
          value={loading ? '...' : `${greenTemplatesCount} / ${templatesCount}`}
          change="Quality: GREEN (High)"
          changeType="positive"
          icon={<CheckCircle className="w-5 h-5" />}
          color="purple"
        />
        <StatsCard
          title="Statutory Pricing"
          value="₹0.7854"
          subtitle="+18% GST (Marketing)"
          icon={<TrendingUp className="w-5 h-5" />}
          color="amber"
        />
      </div>

      {/* Campaign Performance Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Dispatches & Real Campaigns</h2>
          <button
            onClick={() => navigate('/campaigns')}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            View All Campaigns ({campaignsTotal}) →
          </button>
        </div>
        <DataTable
          columns={columns}
          data={campaigns}
          total={campaigns.length}
          emptyTitle="No campaigns created yet"
          emptySubtitle="Launch your first WhatsApp campaign using the 5-step wizard above."
        />
      </div>
    </div>
  );
};
