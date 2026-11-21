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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Automated Client Greetings (Birthday & Festivals)
            </h1>
            <Badge variant="purple">{workflows.length} Workflows Active</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automated WhatsApp outreach matching client Date of Birth (DOB) and statutory Indian stock market festival calendar
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchWorkflows}
            disabled={loading}
            className="apple-btn-secondary"
            title="Refresh Workflows"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="http://localhost:5678"
            target="_blank"
            rel="noopener noreferrer"
            className="apple-btn-primary"
          >
            <ExternalLink className="w-4 h-4" /> Open n8n Studio (5678)
          </a>
        </div>
      </div>

      {/* Engine Status Banner */}
      <div className="p-5 bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl rounded-[22px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[16px] bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">WhatsApp Automation Engine</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Autonomous background workers checking client DOBs daily & Indian festival dates for instant dispatch
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {workflows.length} Active Workflows
          </span>
          <span>Cron: Daily 09:00 IST</span>
          <span>DPDP Consent Enforced</span>
        </div>
      </div>

      {/* Workflow Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="bg-white/80 dark:bg-[#15171C]/80 backdrop-blur-2xl p-6 rounded-[26px] border border-black/5 dark:border-white/10 shadow-apple-card dark:shadow-apple-card-dark hover:border-black/10 dark:hover:border-white/20 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-slate-900 dark:text-white text-base">{wf.name}</h3>
                <Badge variant={wf.status === 'ACTIVE' ? 'success' : 'default'}>
                  {wf.status}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">{wf.description}</p>
              <div className="p-3.5 bg-black/[0.02] dark:bg-white/[0.03] rounded-[18px] border border-black/5 dark:border-white/10 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Trigger Mechanism:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{wf.trigger}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Last Execution:</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{wf.lastRun}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Execution Status:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {wf.lastStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                {wf.filename}
              </span>
              <button
                onClick={() => handleManualTrigger(wf)}
                disabled={triggeringId === wf.id}
                className="apple-btn-primary"
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
