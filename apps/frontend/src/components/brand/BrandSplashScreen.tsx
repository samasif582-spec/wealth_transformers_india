import React, { useEffect, useState } from 'react';
import { WealthTransformersLogo } from './WealthTransformersLogo';
import { ArrowRight } from 'lucide-react';

interface SplashProps {
  onComplete: () => void;
}

export const BrandSplashScreen: React.FC<SplashProps> = ({ onComplete }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true);
      setTimeout(onComplete, 400); // Wait for fade-out transition
    }, 1200);

    return () => clearTimeout(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setFading(true);
    setTimeout(onComplete, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white transition-opacity duration-400 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
        <WealthTransformersLogo variant="hero" />

        <div className="mt-8 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <p className="text-xs font-semibold text-slate-400 tracking-wider">
            Enterprise WhatsApp Automation Platform
          </p>
        </div>

        <button
          onClick={handleSkip}
          className="mt-8 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-1.5"
        >
          Skip Intro <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute bottom-6 text-center">
        <p className="text-[11px] text-slate-500 font-medium">
          Wealth Transformers India Pvt Ltd • SEBI & DPDP Regulated
        </p>
      </div>
    </div>
  );
};
