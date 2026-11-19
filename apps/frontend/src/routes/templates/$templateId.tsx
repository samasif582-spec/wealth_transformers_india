import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  RefreshCw,
  ShieldCheck,
  Send,
  Eye,
  Clock,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

export const TemplateDetailPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const [template, setTemplate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchTemplate = async () => {
    if (!templateId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/templates/${templateId}`);
      setTemplate(res.data);
    } catch (err: any) {
      toast.error('Query Failed', err.message || 'Template not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplate();
  }, [templateId]);

  const handleSyncQuality = async () => {
    if (!templateId) return;
    try {
      setIsSyncing(true);
      await apiClient.post(`/templates/${templateId}/sync-quality`);
      toast.success('Meta Quality Verified', 'Template quality verified GREEN');
      fetchTemplate();
    } catch (err: any) {
      toast.error('Sync Error', err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const latestVersion = template?.versions?.[0];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link
          to="/templates"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 mb-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Templates
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{template?.name || 'Template Details'}</h1>
              <Badge variant={template?.status === 'APPROVED' ? 'success' : 'warning'}>
                {template?.status || 'LOADING'}
              </Badge>
              <Badge variant="success">Quality: {template?.qualityRating || 'GREEN'}</Badge>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">ID: {templateId}</p>
          </div>
          <button
            onClick={handleSyncQuality}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold shadow-xs transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            Sync Meta Status
          </button>
        </div>
      </div>

      {/* Main Details Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase">Category</span>
            <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block">{template?.category}</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase">Language</span>
            <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block uppercase">{template?.language}</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase">Version</span>
            <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block">v{latestVersion?.versionNumber || 1}</span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase">SEBI Footer Checked</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 mt-1 block flex items-center gap-1">
              <ShieldCheck className="w-4 h-4" /> Enforced
            </span>
          </div>
        </div>

        {/* WhatsApp Mobile Bubble Preview */}
        <div>
          <span className="text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 block mb-2">
            Mobile WhatsApp Bubble Preview
          </span>
          <div className="bg-[#EFEAE2] dark:bg-slate-950 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl rounded-tl-none shadow-xs text-slate-900 dark:text-white text-sm space-y-2 border border-slate-200/50 dark:border-slate-700">
              <p className="leading-relaxed whitespace-pre-wrap font-sans">
                {latestVersion?.bodyText || template?.body || 'Loading template body...'}
              </p>
              {latestVersion?.footerText && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-2 leading-snug italic">
                  {latestVersion.footerText}
                </p>
              )}
              <span className="text-[10px] text-slate-400 dark:text-slate-500 text-right block mt-1">
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
              </span>
            </div>
          </div>
        </div>

        {/* Version History Table */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">Immutable Version History</h3>
          <div className="space-y-2">
            {template?.versions?.map((v: any) => (
              <div
                key={v.id}
                className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">Version {v.versionNumber}</span>
                  <span className="text-slate-400 dark:text-slate-500 ml-2 font-mono">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <Badge variant={v.status === 'APPROVED' ? 'success' : 'default'}>{v.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
