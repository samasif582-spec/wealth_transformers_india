import React from 'react';
import logoPng from '../../assets/WTIPL Logo.png';

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
        <div className="relative p-1 rounded-xl bg-white/90 dark:bg-white/10 shadow-xs border border-black/[0.06] dark:border-white/[0.1] backdrop-blur-md">
          <img
            src={logoPng}
            alt="WTIPL"
            className="w-8 h-8 object-contain rounded-lg"
            loading="eager"
          />
        </div>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="relative mb-3 group">
          {/* Apple ambient gradient glow */}
          <div className="absolute -inset-3 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-purple-500/20 opacity-60 blur-xl transition-all duration-700 group-hover:opacity-80" />
          
          <div className="relative p-3 sm:p-4 rounded-2xl bg-white/95 dark:bg-black/40 border border-black/[0.08] dark:border-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl">
            <img
              src={logoPng}
              alt="Wealth Transformers India Pvt Ltd"
              className="w-48 sm:w-56 h-auto max-h-24 object-contain"
              loading="eager"
            />
          </div>
        </div>

        {showSubtitle && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              SEBI Registered Research & Broking Platform
            </span>
          </div>
        )}
      </div>
    );
  }

  // Default: Horizontal
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative p-1.5 rounded-xl bg-white/90 dark:bg-white/10 border border-black/[0.06] dark:border-white/[0.1] shadow-xs backdrop-blur-md">
        <img
          src={logoPng}
          alt="Wealth Transformers India Pvt Ltd"
          className="h-8 sm:h-9 w-auto object-contain"
          loading="eager"
        />
      </div>
      {showSubtitle && (
        <div className="flex flex-col">
          <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Wealth Transformers
          </span>
          <span className="text-[9.5px] font-medium tracking-wide uppercase text-slate-500 dark:text-slate-400">
            India Pvt Ltd
          </span>
        </div>
      )}
    </div>
  );
};
