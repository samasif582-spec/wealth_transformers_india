import React, { useState, useEffect } from 'react';
import {
  Image,
  Upload,
  HardDrive,
  Trash2,
  FileText,
  Video,
  Download,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  metaMediaId?: string | null;
  uploadedAt: string;
}

export const MediaPage: React.FC = () => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [totalStorageBytes, setTotalStorageBytes] = useState<number>(0);
  const [quotaBytes, setQuotaBytes] = useState<number>(10 * 1024 * 1024 * 1024);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      const [mediaRes, quotaRes] = await Promise.allSettled([
        apiClient.get('/media?limit=50'),
        apiClient.get('/media/quota'),
      ]);

      if (mediaRes.status === 'fulfilled') {
        const mData = mediaRes.value.data;
        const list = Array.isArray(mData) ? mData : mData.data || [];
        setAssets(
          list.map((a: any) => ({
            id: a.id,
            filename: a.filename || a.r2ObjectKey || 'asset',
            mimeType: a.mimeType || 'image/jpeg',
            fileSizeBytes: a.fileSizeBytes || a.sizeBytes || 0,
            metaMediaId: a.metaMediaId || null,
            uploadedAt: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : 'Active',
          })),
        );
        if (mData.totalStorageBytes) setTotalStorageBytes(mData.totalStorageBytes);
        if (mData.quotaBytes) setQuotaBytes(mData.quotaBytes);
      }

      if (quotaRes.status === 'fulfilled') {
        const q = quotaRes.value.data;
        if (q.usedBytes !== undefined) setTotalStorageBytes(q.usedBytes);
        if (q.totalQuotaBytes !== undefined) setQuotaBytes(q.totalQuotaBytes);
      }
    } catch (err: any) {
      toast.error('Query Failed', err.message || 'Could not fetch media assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const usedPercent = quotaBytes > 0 ? ((totalStorageBytes / quotaBytes) * 100).toFixed(2) : '0.00';

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiClient.delete(`/media/${deleteTarget.id}`);
      toast.success('Asset Soft-Deleted', `${deleteTarget.filename} marked for 30-day purge`);
      setDeleteTarget(null);
      fetchMedia();
    } catch (err: any) {
      toast.error('Deletion Failed', err.response?.data?.message || err.message);
    }
  };

  const handleDownload = async (asset: MediaAsset) => {
    try {
      const res = await apiClient.get(`/media/${asset.id}/presigned-download`);
      if (res.data?.downloadUrl) {
        window.open(res.data.downloadUrl, '_blank');
        toast.success('Download Initiated', 'Signed R2 download link generated');
      } else {
        toast.info('Asset Ready', `${asset.filename} handle verified`);
      }
    } catch (err: any) {
      toast.error('Download Failed', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Media Asset Library</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cloudflare R2 object storage with Meta WhatsApp Cloud API media handles
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchMedia}
            disabled={loading}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Assets"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Storage Quota Progress */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Cloudflare R2 Bucket Quota</h3>
          </div>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {(totalStorageBytes / (1024 * 1024)).toFixed(2)} MB / {(quotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB ({usedPercent}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(Number(usedPercent), 1))}%` }}
          ></div>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Enforces storage limits per tenant. Soft-deleted assets are retained for 30 days before immutable purge.
        </p>
      </div>

      {/* Asset Grid */}
      {assets.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm">
          No media assets uploaded yet. Media assets uploaded via campaigns or templates will appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {assets.map((asset) => {
            const isImage = asset.mimeType.startsWith('image/');
            const isVideo = asset.mimeType.startsWith('video/');

            return (
              <div
                key={asset.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl">
                      {isImage ? (
                        <Image className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                      ) : isVideo ? (
                        <Video className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                      ) : (
                        <FileText className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                      )}
                    </div>
                    <Badge variant="success">Meta Registered</Badge>
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm truncate" title={asset.filename}>
                    {asset.filename}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mt-2 font-mono">
                    <span>{(asset.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                    <span>•</span>
                    <span>{asset.uploadedAt}</span>
                  </div>
                  {asset.metaMediaId && (
                    <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1 truncate">
                      Meta ID: {asset.metaMediaId}
                    </p>
                  )}
                </div>

                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <button
                    onClick={() => handleDownload(asset)}
                    className="font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={() => setDeleteTarget(asset)}
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Media Asset"
        message={`Are you sure you want to remove "${deleteTarget?.filename}"? It will be immediately inaccessible to new campaigns and purged from R2 storage in 30 days.`}
        confirmLabel="Soft Delete Asset"
        variant="danger"
      />
    </div>
  );
};
