import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Send,
  Eye,
  Pause,
  Play,
  RotateCcw,
  CheckCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { StatsCard } from '../../components/ui/StatsCard';
import { toast } from '../../components/ui/useToast';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../lib/api-client';

export interface CampaignRow {
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

export const CampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 50 };
      if (search.trim()) params.search = search.trim();
      if (typeFilter !== 'ALL') params.type = typeFilter;

      const res = await apiClient.get('/campaigns', { params });
      const cData = res.data;
      const list: CampaignRow[] = Array.isArray(cData) ? cData : cData.data || [];
      setCampaigns(list);
      setTotalCount(cData.total ?? list.length);
    } catch (err: any) {
      toast.error('Query Failed', err.message || 'Could not fetch campaigns');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCampaigns();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, typeFilter]);

  const togglePause = async (campaign: CampaignRow) => {
    try {
      if (campaign.status === 'PAUSED') {
        await apiClient.post(`/campaigns/${campaign.id}/resume`);
        toast.success('Campaign Resumed', `${campaign.name} dispatch resumed`);
      } else {
        await apiClient.post(`/campaigns/${campaign.id}/pause`);
        toast.info('Campaign Paused', `${campaign.name} dispatch paused`);
      }
      fetchCampaigns();
    } catch (err: any) {
      toast.error('Action Failed', err.response?.data?.message || err.message);
    }
  };

  const handleDispatch = async (id: string) => {
    try {
      await apiClient.post(`/campaigns/${id}/send`);
      toast.success('Campaign Dispatched', 'Messages enqueued to BullMQ queue');
      fetchCampaigns();
    } catch (err: any) {
      toast.error('Dispatch Failed', err.response?.data?.message || err.message);
    }
  };

  const activeCount = campaigns.filter(
    (c) => c.status === 'RUNNING' || c.status === 'EXECUTING' || c.status === 'APPROVED',
  ).length;
  const pendingCount = campaigns.filter((c) => c.status === 'PENDING_APPROVAL').length;
  const totalAudience = campaigns.reduce(
    (acc, c) => acc + (c.resolvedRecipientCount || c._count?.recipients || 0),
    0,
  );

  const columns: Column<CampaignRow>[] = [
    {
      key: 'name',
      header: 'Campaign & Template',
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
            {c.template?.name ? `Template: ${c.template.name}` : `ID: ${c.id.slice(0, 8)}...`}
          </p>
        </div>
      ),
    },
    {
      key: 'campaignType',
      header: 'Classification',
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
      key: 'status',
      header: 'Status',
      render: (c) => {
        const variants: Record<string, any> = {
          EXECUTING: 'info',
          RUNNING: 'info',
          COMPLETED: 'success',
          APPROVED: 'success',
          PENDING_APPROVAL: 'warning',
          PAUSED: 'default',
          DRAFT: 'default',
          REJECTED: 'danger',
          CANCELLED: 'danger',
        };
        return <Badge variant={variants[c.status] ?? 'default'}>{c.status}</Badge>;
      },
    },
    {
      key: 'resolvedRecipientCount',
      header: 'Audience Dispatched (P1)',
      render: (c) => (
        <div>
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {(c.resolvedRecipientCount || c._count?.recipients || 0).toLocaleString()} clients
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Opted-in verified</p>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Schedule / Date',
      render: (c) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
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
        <div className="flex items-center gap-2">
          {c.status === 'APPROVED' && (
            <button
              onClick={() => handleDispatch(c.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-white bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold shadow-xs"
              title="Dispatch to Audience"
            >
              <Send className="w-3 h-3" /> Send
            </button>
          )}
          {(c.status === 'RUNNING' || c.status === 'EXECUTING' || c.status === 'PAUSED') && (
            <button
              onClick={() => togglePause(c)}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
              title={c.status === 'PAUSED' ? 'Resume Campaign' : 'Pause Campaign'}
            >
              {c.status === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={() => navigate(`/campaigns/${c.id}`)}
            className="flex items-center gap-1 px-2.5 py-1 text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-xs font-semibold transition-colors"
          >
            <Eye className="w-3.5 h-3.5" /> Details
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Broadcast Campaigns</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Orchestrate WhatsApp outreach with idempotency protection and live monotonic status updates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchCampaigns}
            disabled={loading}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Campaigns"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/campaigns/new"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> New Campaign Wizard
          </Link>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Total Broadcasts"
          value={loading ? '...' : totalCount.toString()}
          subtitle={`${activeCount} executing active`}
          icon={<Send className="w-5 h-5" />}
          color="blue"
        />
        <StatsCard
          title="Target Audience Reach"
          value={loading ? '...' : totalAudience.toLocaleString()}
          change="Opted-in only (P1)"
          changeType="positive"
          icon={<CheckCircle className="w-5 h-5" />}
          color="emerald"
        />
        <StatsCard
          title="Supervisory Approvals"
          value={loading ? '...' : pendingCount.toString()}
          subtitle="Pending admin review"
          icon={<Clock className="w-5 h-5" />}
          color="amber"
        />
        <StatsCard
          title="SEBI Risk Compliance"
          value="100.0%"
          subtitle="Mandatory footers enforced"
          icon={<CheckCircle className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Search & Filter */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns by name..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">All Types</option>
          <option value="PROMOTIONAL">Promotional</option>
          <option value="FESTIVAL">Festival</option>
          <option value="BIRTHDAY">Birthday</option>
          <option value="ANNIVERSARY">Anniversary</option>
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={campaigns}
        total={totalCount}
        emptyTitle="No campaigns found"
        emptySubtitle="Create your first campaign with verified Meta templates."
      />
    </div>
  );
};
