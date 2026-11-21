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
    bg: 'bg-emerald-500/12 dark:bg-emerald-500/15 border-emerald-500/25',
    text: 'text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
  },
  danger: {
    bg: 'bg-rose-500/12 dark:bg-rose-500/15 border-rose-500/25',
    text: 'text-rose-700 dark:text-rose-400',
    dot: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]',
  },
  warning: {
    bg: 'bg-amber-500/12 dark:bg-amber-500/15 border-amber-500/25',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]',
  },
  info: {
    bg: 'bg-blue-500/12 dark:bg-blue-500/15 border-blue-500/25',
    text: 'text-blue-700 dark:text-apple-blue-dark',
    dot: 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]',
  },
  blue: {
    bg: 'bg-blue-500/12 dark:bg-blue-500/15 border-blue-500/25',
    text: 'text-blue-700 dark:text-apple-blue-dark',
    dot: 'bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]',
  },
  purple: {
    bg: 'bg-purple-500/12 dark:bg-purple-500/15 border-purple-500/25',
    text: 'text-purple-700 dark:text-purple-400',
    dot: 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.5)]',
  },
  cyan: {
    bg: 'bg-cyan-500/12 dark:bg-cyan-500/15 border-cyan-500/25',
    text: 'text-cyan-700 dark:text-cyan-400',
    dot: 'bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.5)]',
  },
  gray: {
    bg: 'bg-black/[0.04] dark:bg-white/[0.08] border-black/[0.06] dark:border-white/[0.1]',
    text: 'text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  default: {
    bg: 'bg-black/[0.04] dark:bg-white/[0.08] border-black/[0.06] dark:border-white/[0.1]',
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
      className={`inline-flex items-center gap-1.5 font-medium border rounded-full backdrop-blur-xs ${v.bg} ${v.text} ${
        size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />}
      {children}
    </span>
  );
};
