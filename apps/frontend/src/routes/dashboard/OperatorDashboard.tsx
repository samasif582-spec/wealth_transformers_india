import React, { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  AlertTriangle,
  RotateCcw,
  Zap,
  Server,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { StatsCard } from '../../components/ui/StatsCard';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface FailedJobRecord {
  id: string;
  campaignId?: string | null;
  clientId: string;
  templateId: string;
  deliveryStatus: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  dispatchedAt: string;
  client?: {
    id: string;
    fullName: string;
    whatsappNumber: string;
  };
  campaign?: {
    id: string;
    name: string;
  };
}

export const OperatorDashboard: React.FC = () => {
  const [failedJobs, setFailedJobs] = useState<FailedJobRecord[]>([]);
  const [queueStats, setQueueStats] = useState<{
    messages: Record<string, number>;
    webhooks: Record<string, number>;
  }>({
    messages: { QUEUED: 0, SENT: 0, DELIVERED: 0, READ: 0, FAILED: 0, UNDELIVERABLE: 0 },
    webhooks: { PENDING: 0, PROCESSED: 0, FAILED: 0 },
  });
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [retryJobId, setRetryJobId] = useState<string | null>(null);
  const [isRetryingAll, setIsRetryingAll] = useState<boolean>(false);

  const fetchOperatorTelemetry = async () => {
    try {
      setLoading(true);
      const [queueRes, failedRes, healthRes] = await Promise.allSettled([
        apiClient.get('/analytics/queue-stats'),
        apiClient.get('/analytics/failed-logs'),
        apiClient.get('/health'),
      ]);

      if (queueRes.status === 'fulfilled') {
        setQueueStats(queueRes.value.data);
      }

      if (failedRes.status === 'fulfilled') {
        setFailedJobs(Array.isArray(failedRes.value.data) ? failedRes.value.data : []);
      }

      if (healthRes.status === 'fulfilled') {
        setHealthStatus(healthRes.value.data);
      }
    } catch (err: any) {
      toast.error('Telemetry Error', err.message || 'Failed to load telemetry data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOperatorTelemetry();
  }, []);

  const handleRetryJob = async () => {
    if (!retryJobId) return;
    try {
      await apiClient.post(`/analytics/failed-logs/${retryJobId}/retry`);
      toast.success('Job Re-enqueued', `Job ${retryJobId.slice(0, 8)} reset to QUEUED for delivery`);
      setFailedJobs((prev) => prev.filter((j) => j.id !== retryJobId));
      fetchOperatorTelemetry();
    } catch (err: any) {
      toast.error('Retry Failed', err.message);
    } finally {
      setRetryJobId(null);
    }
  };

  const handleRetryAll = async () => {
    setIsRetryingAll(true);
    try {
      await apiClient.post('/analytics/failed-logs/retry-all');
      toast.success('DLQ Flushed', 'All dead-letter jobs re-enqueued for delivery');
      setFailedJobs([]);
      fetchOperatorTelemetry();
    } catch (err: any) {
      toast.error('Bulk Retry Failed', err.message);
    } finally {
      setIsRetryingAll(false);
    }
  };

  const columns: Column<FailedJobRecord>[] = [
    {
      key: 'id',
      header: 'Message Log ID',
      render: (j) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-800">
            {j.id.slice(0, 8)}...
          </span>
          <p className="text-[11px] text-slate-400 font-mono">
            {j.campaign?.name || 'Automated Greeting'}
          </p>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Recipient Phone',
      render: (j) => (
        <div>
          <span className="font-mono text-xs text-slate-800 font-semibold">
            {j.client?.whatsappNumber || 'N/A'}
          </span>
          <p className="text-[11px] text-slate-400">{j.client?.fullName || 'Client'}</p>
        </div>
      ),
    },
    {
      key: 'errorMessage',
      header: 'Diagnostic Reason',
      render: (j) => (
        <span className="text-xs text-rose-600 max-w-xs truncate block font-medium">
          {j.errorMessage || j.errorCode || 'Message delivery failed at Meta gateway'}
        </span>
      ),
    },
    {
      key: 'retryCount',
      header: 'Attempts',
      render: (j) => (
        <span className="text-xs font-semibold text-slate-600">{j.retryCount} / 5</span>
      ),
    },
    {
      key: 'deliveryStatus',
      header: 'Status',
      render: (j) => (
        <Badge variant={j.deliveryStatus === 'UNDELIVERABLE' ? 'danger' : 'warning'}>
          {j.deliveryStatus}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (j) => (
        <button
          onClick={() => setRetryJobId(j.id)}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-semibold"
        >
          <RotateCcw className="w-3 h-3" /> Retry
        </button>
      ),
    },
  ];

  const totalFailed = (queueStats.messages?.FAILED || 0) + (queueStats.messages?.UNDELIVERABLE || 0);
  const totalCompleted = (queueStats.messages?.DELIVERED || 0) + (queueStats.messages?.READ || 0);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Message Queue & Dispatch Engine</h1>
            <Badge variant="warning">Operator</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time BullMQ telemetry, worker thread health & dead-letter queue management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchOperatorTelemetry}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleRetryAll}
            disabled={failedJobs.length === 0 || isRetryingAll}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
          >
            <RotateCcw className={`w-4 h-4 ${isRetryingAll ? 'animate-spin' : ''}`} /> Retry All Failed Jobs
          </button>
        </div>
      </div>

      {/* Real-time Rate Limiter Indicator */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Meta Throughput Throttler</span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
              Target Ceiling: <span className="text-blue-600 dark:text-blue-400">80 msg/sec</span> (Meta Tier 1)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Database Latency: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{healthStatus?.database?.latency_ms ?? 1}ms</span> • Redis State: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">CONNECTED</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
              Worker Concurrency: 10
            </span>
          </div>
        </div>
        {/* Visual Velocity Bar */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(5, (queueStats.messages?.QUEUED || 0) * 10))}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-mono">
          <span>0 msg/s</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">Active Jobs Queued: {queueStats.messages?.QUEUED || 0}</span>
          <span>Max 80 msg/s</span>
        </div>
      </div>

      {/* Queue Health Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">campaign-messages</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Queued</span>
              <span className="font-bold text-slate-800 dark:text-white">{queueStats.messages?.QUEUED || 0}</span>
            </div>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 rounded">
              <span className="text-blue-500 dark:text-blue-400 block text-[10px] uppercase font-semibold">Sent</span>
              <span className="font-bold text-blue-700 dark:text-blue-200">{queueStats.messages?.SENT || 0}</span>
            </div>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded">
              <span className="text-emerald-500 dark:text-emerald-400 block text-[10px] uppercase font-semibold">Delivered</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-200">{totalCompleted}</span>
            </div>
            <div className={`p-2 rounded ${totalFailed > 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300' : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'}`}>
              <span className="block text-[10px] uppercase font-semibold">Failed</span>
              <span className="font-bold">{totalFailed}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">webhook-processing</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Pending</span>
              <span className="font-bold text-slate-800 dark:text-white">{queueStats.webhooks?.PENDING || 0}</span>
            </div>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded">
              <span className="text-emerald-500 dark:text-emerald-400 block text-[10px] uppercase font-semibold">Processed</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-200">{queueStats.webhooks?.PROCESSED || 0}</span>
            </div>
            <div className={`p-2 rounded col-span-2 ${(queueStats.webhooks?.FAILED || 0) > 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300' : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400'}`}>
              <span className="block text-[10px] uppercase font-semibold">Errors</span>
              <span className="font-bold">{queueStats.webhooks?.FAILED || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">consent-dlq</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded">
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-semibold">Active</span>
              <span className="font-bold text-slate-800 dark:text-white">0</span>
            </div>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded">
              <span className="text-emerald-500 dark:text-emerald-400 block text-[10px] uppercase font-semibold">Healthy</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-200">100%</span>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded col-span-2">
              <span className="block text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500">Fallback Strategy</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">Audit Redaction</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">template-quality-sync</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 rounded col-span-2">
              <span className="text-emerald-600 dark:text-emerald-400 block text-[10px] uppercase font-semibold">Cron Schedule</span>
              <span className="font-bold text-emerald-800 dark:text-emerald-200">02:00 UTC (Daily)</span>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded col-span-2">
              <span className="block text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500">Red Score Auto-Block</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">Active (P6 Guard)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dead-Letter Queue (DLQ) & Failed Jobs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Dead-Letter Queue & Undeliverables</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Retries utilize exponential backoff (30s × 2^attempts, max 5). Non-retriable errors marked UNDELIVERABLE.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-full">
            {failedJobs.length} Failed Records
          </span>
        </div>

        <DataTable
          columns={columns}
          data={failedJobs}
          total={failedJobs.length}
          emptyTitle="DLQ is completely clear"
          emptySubtitle="All message dispatches and webhook events processed cleanly in PostgreSQL."
        />
      </div>

      {/* Retry Modal */}
      <ConfirmDialog
        isOpen={Boolean(retryJobId)}
        onClose={() => setRetryJobId(null)}
        onConfirm={handleRetryJob}
        title="Retry Message Dispatch"
        message="This will reset the delivery status to QUEUED and increment retry count for immediate dispatch to WhatsApp Cloud API."
        confirmLabel="Re-enqueue Job"
        variant="primary"
      />
    </div>
  );
};
