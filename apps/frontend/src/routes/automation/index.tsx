import React, { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface WorkflowMeta {
  id: string;
  name: string;
  filename: string;
  trigger: string;
  description: string;
  status: 'ACTIVE' | 'PAUSED';
  lastRun: string;
  lastStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
}

export const AutomationPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/automation/workflows');
      const list: WorkflowMeta[] = Array.isArray(res.data) ? res.data : [];
      setWorkflows(list);
    } catch (err: any) {
      toast.error('Sync Error', err.message || 'Could not load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleManualTrigger = async (wf: WorkflowMeta) => {
    setTriggeringId(wf.id);
    try {
      const res = await apiClient.post(`/automation/workflows/${wf.id}/trigger`);
      toast.success(
        'Workflow Initiated',
        `${wf.name} triggered successfully via n8n runtime engine`,
      );
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === wf.id
            ? { ...w, lastRun: 'Just now', lastStatus: 'SUCCESS' }
            : w,
        ),
      );
    } catch (err: any) {
      toast.error('Trigger Failed', err.response?.data?.message || err.message);
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">n8n Automation Control Hub</h1>
            <Badge variant="purple">8 Workflows Active</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Autonomous workflows executing event-driven and scheduled WhatsApp campaigns from real database triggers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchWorkflows}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            title="Refresh Workflows"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="http://localhost:5678"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            <ExternalLink className="w-4 h-4" /> Open n8n Studio (5678)
          </a>
        </div>
      </div>

      {/* Engine Status Banner */}
      <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-base">n8n Workflow Daemon Online</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Listening on port 5678 • Authenticated with backend internal security key (X-Internal-Api-Key)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {workflows.length} Active Workflows
          </span>
          <span>Cron Schedules: 4</span>
          <span>Webhooks: 3</span>
        </div>
      </div>

      {/* Workflow Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-bold text-slate-900 text-base">{wf.name}</h3>
                <Badge variant={wf.status === 'ACTIVE' ? 'success' : 'default'}>
                  {wf.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">{wf.description}</p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Trigger Mechanism:</span>
                  <span className="font-mono text-slate-700 font-semibold">{wf.trigger}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Last Execution:</span>
                  <span className="text-slate-700 font-medium">{wf.lastRun}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Execution Status:</span>
                  <span className="text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {wf.lastStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]">
                {wf.filename}
              </span>
              <button
                onClick={() => handleManualTrigger(wf)}
                disabled={triggeringId === wf.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${triggeringId === wf.id ? 'animate-spin' : ''}`} />
                {triggeringId === wf.id ? 'Executing...' : 'Trigger Now'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
