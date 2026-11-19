import React from 'react';

interface LogoProps {
  variant?: 'horizontal' | 'compact' | 'hero';
  className?: string;
  showSubtitle?: boolean;
}

export const WealthTransformersLogo: React.FC<LogoProps> = ({
  variant = 'horizontal',
  className = '',
  showSubtitle = true,
}) => {
  if (variant === 'compact') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <svg
          className="w-8 h-8 flex-shrink-0"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="wtGradCompact1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="wtGradCompact2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="10" fill="#0F172A" />
          <path
            d="M10 24L17 14L22 21L27 14L30 18"
            stroke="url(#wtGradCompact1)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13 28L18 21L23 27L28 20L31 24"
            stroke="url(#wtGradCompact2)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        </svg>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="relative mb-4">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-blue-600 opacity-30 blur-lg animate-pulse" />
          <svg
            className="relative w-16 h-16"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="wtGradHero1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="wtGradHero2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="18" fill="#0F172A" />
            <path
              d="M16 38L27 22L35 33L43 22L48 28"
              stroke="url(#wtGradHero1)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 44L28 33L36 42L44 31L49 37"
              stroke="url(#wtGradHero2)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.8"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Wealth <span className="text-emerald-500">Transformers</span>
        </h1>
        {showSubtitle && (
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-500 dark:text-slate-400 mt-1">
            India Pvt Ltd
          </p>
        )}
      </div>
    );
  }

  // Default: Horizontal
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        className="w-9 h-9 flex-shrink-0"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="wtGradH1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="wtGradH2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="#0F172A" />
        <path
          d="M10 24L17 14L22 21L27 14L30 18"
          stroke="url(#wtGradH1)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 28L18 21L23 27L28 20L31 24"
          stroke="url(#wtGradH2)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
      </svg>
      <div className="flex flex-col">
        <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Wealth <span className="text-emerald-500">Transformers</span>
        </span>
        {showSubtitle && (
          <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
            India Pvt Ltd
          </span>
        )}
      </div>
    </div>
  );
};
