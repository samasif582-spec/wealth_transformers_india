import React, { useState, useEffect } from 'react';
import { Image, Search, Check, UploadCloud, RefreshCw, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { apiClient } from '../../lib/api-client';

export interface SelectedMediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  url?: string;
  metaMediaId?: string | null;
}

interface MediaAssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: SelectedMediaAsset) => void;
  currentSelectedId?: string;
}

export const MediaAssetPickerModal: React.FC<MediaAssetPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentSelectedId,
}) => {
  const [assets, setAssets] = useState<SelectedMediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<SelectedMediaAsset | null>(null);

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/media?limit=100');
      const list = Array.isArray(res.data) ? res.data : res.data.data || [];
      // Filter for image mime types
      const imageAssets = list
        .filter((a: any) => (a.mimeType || '').startsWith('image/'))
        .map((a: any) => ({
          id: a.id,
          filename: a.filename || a.r2ObjectKey || 'asset.jpg',
          mimeType: a.mimeType || 'image/jpeg',
          metaMediaId: a.metaMediaId || null,
          url: a.publicUrl || `/api/v1/media/${a.id}/content`,
        }));

      setAssets(imageAssets);
      if (currentSelectedId) {
        const current = imageAssets.find((a: any) => a.id === currentSelectedId);
        if (current) setSelectedAsset(current);
      }
    } catch {
      // If error or empty, fallback
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAssets();
    }
  }, [isOpen]);

  const filteredAssets = assets.filter((a) =>
    a.filename.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleConfirm = () => {
    if (selectedAsset) {
      onSelect(selectedAsset);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Template Header Image"
      description="Choose an approved brand or campaign graphic from Media Assets to attach to the WhatsApp template header."
      size="lg"
    >
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search image assets by filename..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Assets Grid */}
        <div className="max-h-96 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs">Loading media assets...</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Image className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No image assets found
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Upload image assets in the Media Assets tab first (PNG, JPEG, WebP) to attach them as WhatsApp headers.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredAssets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`group relative p-2.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col gap-2 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-500 bg-white dark:bg-slate-800/80'
                    }`}
                  >
                    <div className="w-full h-28 rounded-xl bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center overflow-hidden relative">
                      <Image className="w-8 h-8 text-slate-400" />
                      {isSelected && (
                        <div className="absolute top-2 right-2 p-1 rounded-full bg-emerald-600 text-white shadow-xs">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="truncate">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {asset.filename}
                      </p>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {asset.mimeType.split('/')[1]?.toUpperCase() || 'IMAGE'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected asset indicator & actions */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
            {selectedAsset ? (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400 truncate">
                <Check className="w-4 h-4 flex-shrink-0" />
                Selected: {selectedAsset.filename}
              </span>
            ) : (
              'Click an asset to select'
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedAsset}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
