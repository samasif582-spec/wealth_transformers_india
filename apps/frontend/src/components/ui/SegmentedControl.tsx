import React from 'react';
import { motion } from 'framer-motion';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  id?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  id = 'apple-segmented-pill',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center p-1 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] backdrop-blur-md border border-black/[0.04] dark:border-white/[0.08] select-none ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(option.value)}
            className={`relative flex items-center justify-center gap-1.5 font-medium transition-colors cursor-pointer z-10 ${
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-xs'
            } ${
              isSelected
                ? 'text-slate-900 dark:text-white font-semibold'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {isSelected && (
              <motion.div
                layoutId={`pill-${id}`}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                className="absolute inset-0 rounded-lg bg-white dark:bg-[#2C2C2E] shadow-xs dark:shadow-md border border-black/[0.04] dark:border-white/[0.12] z-[-1]"
              />
            )}
            {option.icon && (
              <span className={`w-3.5 h-3.5 flex items-center justify-center ${isSelected ? 'text-apple-blue dark:text-apple-blue-dark' : 'text-current'}`}>
                {option.icon}
              </span>
            )}
            <span>{option.label}</span>
            {option.badge !== undefined && (
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isSelected
                    ? 'bg-apple-blue/15 text-apple-blue dark:text-apple-blue-dark'
                    : 'bg-black/10 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                }`}
              >
                {option.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
