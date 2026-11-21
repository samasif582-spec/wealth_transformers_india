import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore, ToastType } from './useToast';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  error: <AlertCircle className="w-5 h-5 text-rose-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

const borderColors: Record<ToastType, string> = {
  success: 'border-emerald-200 dark:border-emerald-800',
  error: 'border-rose-200 dark:border-rose-800',
  warning: 'border-amber-200 dark:border-amber-800',
  info: 'border-blue-200 dark:border-blue-800',
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="pointer-events-auto flex items-start gap-3 p-4 bg-white/92 dark:bg-[#1C1E24]/92 backdrop-blur-3xl rounded-[20px] shadow-[0_16px_40px_rgba(0,0,0,0.25)] border border-black/[0.08] dark:border-white/[0.12]"
          >
            <div className="flex-shrink-0 mt-0.5">{icons[t.type]}</div>
            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold text-slate-900 dark:text-white tracking-tight">
                {t.title}
              </h5>
              {t.message && (
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
                  {t.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss toast"
              className="flex-shrink-0 w-6 h-6 rounded-full bg-black/[0.04] dark:bg-white/10 hover:bg-black/[0.08] dark:hover:bg-white/20 flex items-center justify-center text-slate-400 dark:text-white/70 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
