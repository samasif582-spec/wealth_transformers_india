import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  subtitle?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'emerald' | 'amber' | 'purple' | 'rose';
  delay?: number;
}

const colorMap = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-apple-blue-dark border border-blue-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
};

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  subtitle,
  icon,
  color = 'blue',
  delay = 0,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="bg-white/80 dark:bg-[#181A20]/80 backdrop-blur-2xl rounded-[22px] p-5 border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)] flex flex-col justify-between"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
            {title}
          </span>
          <h4 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 -tracking-[0.03em]">
            {value}
          </h4>
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-xs ${colorMap[color]}`}>
            {icon}
          </div>
        )}
      </div>

      {(change || subtitle) && (
        <div className="mt-3.5 pt-3 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {change && (
            <span
              className={`font-semibold px-2 py-0.5 rounded-full text-[11px] inline-flex items-center gap-1 ${
                changeType === 'positive'
                  ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : changeType === 'negative'
                  ? 'bg-rose-500/12 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  : 'bg-black/[0.04] dark:bg-white/[0.06] text-slate-500'
              }`}
            >
              {changeType === 'positive' && <TrendingUp className="w-3 h-3" />}
              {changeType === 'negative' && <TrendingDown className="w-3 h-3" />}
              {change}
            </span>
          )}
          {subtitle && <span className="truncate">{subtitle}</span>}
        </div>
      )}
    </motion.div>
  );
};
