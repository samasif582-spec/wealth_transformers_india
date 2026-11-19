import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  Eye,
  AlertTriangle,
  Pause,
  Play,
  Download,
  RotateCcw,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { StatsCard } from '../../components/ui/StatsCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface RecipientLog {
  id: string;
  clientName: string;
  phone: string;
  category: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'UNDELIVERABLE';
  wamid?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
}

export const CampaignDetailPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<any>(null);
  const [recipients, setRecipients] = useState<RecipientLog[]>([]);
  const [deliveryCounts, setDeliveryCounts] = useState({
    QUEUED: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    UNDELIVERABLE: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchCampaignDetail = async () => {
    if (!campaignId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/campaigns/${campaignId}`);
      const data = res.data;
      setCampaign(data);
      if (data.statusCounts) {
        setDeliveryCounts(data.statusCounts);
      }
      if (Array.isArray(data.messageLogs)) {
        setRecipients(
          data.messageLogs.map((l: any) => ({
            id: l.id,
            clientName: l.client?.fullName || 'Client',
            phone: l.client?.whatsappNumber || 'N/A',
            category: l.client?.categoryTier || 'RETAIL',
            status: l.deliveryStatus,
            wamid: l.metaMessageId,
            sentAt: l.sentAt ? new Date(l.sentAt).toLocaleTimeString() : undefined,
            deliveredAt: l.deliveredAt ? new Date(l.deliveredAt).toLocaleTimeString() : undefined,
            readAt: l.readAt ? new Date(l.readAt).toLocaleTimeString() : undefined,
          })),
        );
      }
    } catch (err: any) {
      toast.error('Query Failed', err.message || 'Could not fetch campaign details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaignDetail();
  }, [campaignId]);

  const togglePause = async () => {
    if (!campaign) return;
    try {
      if (campaign.status === 'PAUSED') {
        await apiClient.post(`/campaigns/${campaign.id}/resume`);
        toast.success('Campaign Resumed', 'Dispatch resumed for active audience');
      } else {
        await apiClient.post(`/campaigns/${campaign.id}/pause`);
        toast.info('Campaign Paused', 'Dispatch suspended for active audience');
      }
      fetchCampaignDetail();
    } catch (err: any) {
      toast.error('Action Failed', err.response?.data?.message || err.message);
    }
  };

  const handleExportCsv = async () => {
    if (!campaignId) return;
    try {
      window.open(`http://localhost:3000/api/v1/analytics/campaigns/${campaignId}/export`, '_blank');
      toast.success('Exporting Log', 'Full delivery recipient report downloading...');
    } catch (err: any) {
      toast.error('Export Error', err.message);
    }
  };

  const isRunning = campaign?.status === 'EXECUTING' || campaign?.status === 'RUNNING';
  const totalAudience = campaign?.resolvedRecipientCount || 0;

  const columns: Column<RecipientLog>[] = [
    {
      key: 'clientName',
      header: 'Recipient',
      render: (r) => (
        <div>
          <p className="font-semibold text-slate-900">{r.clientName}</p>
          <p className="text-xs text-slate-400 font-mono">{r.phone}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Segment',
      render: (r) => <Badge variant="purple">{r.category}</Badge>,
    },
    {
      key: 'status',
      header: 'Monotonic Status (P3)',
      render: (r) => {
        const variants: Record<string, any> = {
          READ: 'purple',
          DELIVERED: 'success',
          SENT: 'info',
          QUEUED: 'default',
          FAILED: 'danger',
          UNDELIVERABLE: 'danger',
        };
        return <Badge variant={variants[r.status] ?? 'default'}>{r.status}</Badge>;
      },
    },
    {
      key: 'sentAt',
      header: 'Timeline (Lifecycle)',
      render: (r) => (
        <div className="text-xs font-mono text-slate-500">
          {r.sentAt && <span>Sent: {r.sentAt}</span>}
          {r.deliveredAt && <span> → Dlv: {r.deliveredAt}</span>}
          {r.readAt && <span className="text-blue-600 font-semibold"> → Read: {r.readAt}</span>}
        </div>
      ),
    },
    {
      key: 'wamid',
      header: 'Meta WAMID',
      render: (r) => (
        <span className="font-mono text-[11px] text-slate-400 truncate max-w-[140px] block">
          {r.wamid || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div>
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Broadcasts
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900">{campaign?.name || 'Campaign Report'}</h1>
              <Badge variant={isRunning ? 'info' : 'default'}>
                {campaign?.status || 'LOADING'}
              </Badge>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">ID: {campaignId}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchCampaignDetail}
              disabled={loading}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              title="Refresh Campaign Report"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {(isRunning || campaign?.status === 'PAUSED') && (
              <button
                onClick={togglePause}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isRunning
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isRunning ? 'Pause Outbound' : 'Resume Outbound'}
              </button>
            )}
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold shadow-xs"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* KPI Funnel Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs text-center">
          <span className="text-xs uppercase font-semibold text-slate-400">Total Audience (P1)</span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{totalAudience}</p>
          <span className="text-[11px] text-slate-400">Opted-in verified</span>
        </div>
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-center">
          <span className="text-xs uppercase font-semibold text-blue-600">Dispatched (Sent)</span>
          <p className="text-2xl font-bold text-blue-700 mt-1">{deliveryCounts.SENT + deliveryCounts.DELIVERED + deliveryCounts.READ}</p>
          <span className="text-[11px] text-blue-500">Meta Gateway</span>
        </div>
        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-center">
          <span className="text-xs uppercase font-semibold text-emerald-600">Delivered</span>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{deliveryCounts.DELIVERED + deliveryCounts.READ}</p>
          <span className="text-[11px] text-emerald-500">Device Receipt</span>
        </div>
        <div className="bg-purple-50 p-4 rounded-xl border border-purple-200 text-center">
          <span className="text-xs uppercase font-semibold text-purple-600">Read / Opened</span>
          <p className="text-2xl font-bold text-purple-700 mt-1">{deliveryCounts.READ}</p>
          <span className="text-[11px] text-purple-500">Blue Ticks</span>
        </div>
        <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 text-center">
          <span className="text-xs uppercase font-semibold text-rose-600">Bounced / Failed</span>
          <p className="text-2xl font-bold text-rose-700 mt-1">{deliveryCounts.FAILED + deliveryCounts.UNDELIVERABLE}</p>
          <span className="text-[11px] text-rose-500">Undeliverables</span>
        </div>
      </div>

      {/* Recipient Roster */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Per-Recipient Delivery Progression</h2>
          <span className="text-xs text-slate-500">
            Property P3: Monotonic status transitions enforced via Meta Webhooks
          </span>
        </div>
        <DataTable
          columns={columns}
          data={recipients}
          total={recipients.length}
          emptyTitle="No message logs for this campaign yet"
          emptySubtitle="Message logs appear as recipients are dispatched."
        />
      </div>
    </div>
  );
};
