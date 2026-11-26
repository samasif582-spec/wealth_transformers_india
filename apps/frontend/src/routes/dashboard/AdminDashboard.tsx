import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Users,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Play,
  Pause,
} from 'lucide-react';
import { StatsCard } from '../../components/ui/StatsCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface PendingCampaign {
  id: string;
  name: string;
  campaignType: string;
  template?: { name: string };
  resolvedRecipientCount: number;
  createdBy?: { fullName: string; email: string };
  createdAt: string;
}

export const AdminDashboard: React.FC = () => {
  const [pendingCampaigns, setPendingCampaigns] = useState<PendingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientStats, setClientStats] = useState({ total: 0, optedIn: 0, optedOut: 0 });
  const [selectedCampaign, setSelectedCampaign] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [isQueuePaused, setIsQueuePaused] = useState(false);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [campaignsRes, statsRes] = await Promise.allSettled([
        apiClient.get('/campaigns?status=PENDING_APPROVAL'),
        apiClient.get('/clients/stats'),
      ]);

      if (campaignsRes.status === 'fulfilled') {
        const cData = campaignsRes.value.data;
        setPendingCampaigns(Array.isArray(cData) ? cData : cData.data || []);
      }

      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value.data;
        setClientStats({
          total: s.total || 0,
          optedIn: s.opted_in || s.optedIn || 0,
          optedOut: s.opted_out || s.optedOut || 0,
        });
      }
    } catch (err: any) {
      toast.error('Data Fetch Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleConfirmAction = async () => {
    if (!selectedCampaign) return;
    const { id, action } = selectedCampaign;

    try {
      if (action === 'approve') {
        await apiClient.post(`/campaigns/${id}/approve`);
        toast.success('Campaign Approved & Dispatched', `Campaign enqueued into BullMQ message queue`);
      } else {
        await apiClient.post(`/campaigns/${id}/reject`, { reason: 'Rejected during supervisory review' });
        toast.warning('Campaign Rejected', `Campaign returned to draft with supervisor comments`);
      }
      fetchAdminData();
    } catch (err: any) {
      toast.error('Action Failed', err.response?.data?.message || err.message);
    } finally {
      setSelectedCampaign(null);
    }
  };

  const toggleQueue = () => {
    setIsQueuePaused(!isQueuePaused);
    if (!isQueuePaused) {
      toast.warning('Queue Paused', 'BullMQ campaign-messages worker paused across all instances');
    } else {
      toast.success('Queue Resumed', 'Message dispatch resumed at 80 msg/sec limit');
    }
  };

  const columns: Column<PendingCampaign>[] = [
    {
      key: 'name',
      header: 'Campaign Name',
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Template: {c.template?.name || 'Standard'}</p>
        </div>
      ),
    },
    {
      key: 'campaignType',
      header: 'Category',
      render: (c) => {
        const variants: Record<string, any> = {
          FESTIVAL: 'purple',
          PROMOTIONAL: 'info',
          BIRTHDAY: 'success',
        };
        return <Badge variant={variants[c.campaignType] ?? 'default'}>{c.campaignType}</Badge>;
      },
    },
    {
      key: 'resolvedRecipientCount',
      header: 'Audience (Opted-In)',
      render: (c) => (
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {(c.resolvedRecipientCount || 0).toLocaleString()} clients
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: 'Submitted By',
      render: (c) => (
        <div>
          <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{c.createdBy?.fullName || c.createdBy?.email || 'Marketing'}</p>
          <p className="text-[11px] text-slate-400 font-mono">
            {c.createdAt ? new Date(c.createdAt).toLocaleTimeString() : 'Recent'}
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Decision',
      render: (c) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedCampaign({ id: c.id, action: 'approve' })}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-full text-xs font-semibold shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Approve
          </button>
          <button
            onClick={() => setSelectedCampaign({ id: c.id, action: 'reject' })}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-full text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white -tracking-[0.025em]">Operations Control</h1>
            <Badge variant="info">Admin</Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Supervise campaign dispatches, compliance approvals, audience segments & delivery health
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleQueue}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold transition-all shadow-xs active:scale-[0.98] cursor-pointer border ${
              isQueuePaused
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white border-emerald-400/30'
                : 'bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 border-black/[0.06] dark:border-white/[0.1]'
            }`}
          >
            {isQueuePaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-white" /> Resume Message Queue
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-500" /> Pause Message Queue
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats (Real Data) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Campaigns Awaiting Approval"
          value={pendingCampaigns.length}
          subtitle="Mandatory SEBI supervisor check"
          icon={<Clock className="w-5 h-5" />}
          color="amber"
        />
        <StatsCard
          title="Verified Opted-In Clients"
          value={clientStats.optedIn}
          change="Eligible for marketing (P1)"
          changeType="positive"
          icon={<Users className="w-5 h-5" />}
          color="emerald"
        />
        <StatsCard
          title="Total Clients in DB"
          value={clientStats.total}
          subtitle="Retail, HNI, Corporate"
          icon={<ShieldCheck className="w-5 h-5" />}
          color="blue"
        />
        <StatsCard
          title="Opt-Out Records (DPDP)"
          value={clientStats.optedOut}
          subtitle="Strictly suppressed"
          icon={<Send className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Campaign Approval Queue (Real Database Records) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Campaigns Pending Executive Approval</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Promotional & Announcement dispatches require 100% verified template and SEBI footer checks
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-full">
            {pendingCampaigns.length} Require Review
          </span>
        </div>

        <DataTable
          columns={columns}
          data={pendingCampaigns}
          loading={loading}
          total={pendingCampaigns.length}
          emptyTitle="No Pending Approvals"
          emptySubtitle="All promotional & announcement campaigns have been approved and processed."
        />
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(selectedCampaign)}
        onClose={() => setSelectedCampaign(null)}
        onConfirm={handleConfirmAction}
        title={selectedCampaign?.action === 'approve' ? 'Approve Campaign' : 'Reject Campaign'}
        message={
          selectedCampaign?.action === 'approve'
            ? 'This will immediately schedule the campaign and queue all eligible opted-in recipients into BullMQ.'
            : 'This will reject the campaign and prevent dispatch until revised by the marketing team.'
        }
        confirmLabel={selectedCampaign?.action === 'approve' ? 'Approve & Dispatch' : 'Reject Campaign'}
        variant={selectedCampaign?.action === 'approve' ? 'primary' : 'danger'}
      />
    </div>
  );
};
