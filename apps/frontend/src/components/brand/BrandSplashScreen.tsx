import React, { useEffect, useState } from 'react';
import logoPng from '../../assets/WTIPL Logo.png';

interface SplashProps {
  onComplete: () => void;
}

export const BrandSplashScreen: React.FC<SplashProps> = ({ onComplete }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Preload logo in memory immediately
    const img = new Image();
    img.src = logoPng;

    const timer = setTimeout(() => {
      setFading(true);
      setTimeout(onComplete, 450); // Fluid Apple fade-out transition
    }, 1300);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setFading(true);
    setTimeout(onComplete, 200);
  };

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#F5F5F7] dark:bg-[#000000] text-slate-900 dark:text-white transition-all duration-500 ease-out cursor-pointer ${
        fading ? 'opacity-0 scale-[1.02] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Apple Subtle Radial Glow */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-emerald-500/10 via-blue-500/15 to-purple-500/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center px-4 animate-in fade-in zoom-in-95 duration-700">
        <div className="p-4 sm:p-5 rounded-3xl bg-white/95 dark:bg-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] border border-black/[0.08] dark:border-white/[0.15] backdrop-blur-3xl mb-5">
          <img
            src={logoPng}
            alt="Wealth Transformers India Pvt Ltd"
            className="w-56 sm:w-64 h-auto object-contain"
            loading="eager"
          />
        </div>

        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.1] backdrop-blur-md">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 tracking-wider uppercase">
            SEBI Regulated Advisory & Broadcast Hub
          </p>
        </div>
      </div>

      <div className="absolute bottom-8 text-center px-4">
        <p className="text-[10.5px] text-slate-400 dark:text-slate-500 font-medium tracking-wide">
          Wealth Transformers India Pvt Ltd • INZ000123456 • AMFI ARN-98765
        </p>
      </div>
    </div>
  );
};
