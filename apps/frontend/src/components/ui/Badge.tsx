import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'default'
  | 'purple'
  | 'cyan'
  | 'gray'
  | 'blue';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant | string;
  size?: 'sm' | 'md';
  dot?: boolean;
}

const variants: Record<string, { bg: string; text: string; dot: string }> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  danger: {
    bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800',
    text: 'text-purple-700 dark:text-purple-400',
    dot: 'bg-purple-500',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-200 dark:border-cyan-800',
    text: 'text-cyan-700 dark:text-cyan-400',
    dot: 'bg-cyan-500',
  },
  gray: {
    bg: 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  default: {
    bg: 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  dot = true,
}) => {
  const v = (variant && variants[variant]) ? variants[variant] : variants.default;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-full ${v.bg} ${v.text} ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />}
      {children}
    </span>
  );
};
