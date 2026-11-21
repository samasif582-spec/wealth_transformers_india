import React from 'react';
import { Modal } from './Modal';
import { AlertTriangle, Info } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex gap-4">
        <div
          className={`p-3 rounded-full flex-shrink-0 h-fit ${
            isDanger
              ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
              : isWarning
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
              : 'bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
          }`}
        >
          {isDanger || isWarning ? (
            <AlertTriangle className="w-6 h-6" />
          ) : (
            <Info className="w-6 h-6" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="px-5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.14] rounded-full transition-all disabled:opacity-50 border border-black/[0.05] dark:border-white/[0.08]"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
          }}
          disabled={isLoading}
          className={`px-5 py-2 text-xs font-semibold text-white rounded-full shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 ${
            isDanger
              ? 'bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-rose-500/20'
              : isWarning
              ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-500/20'
              : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20'
          }`}
        >
          {isLoading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
};
