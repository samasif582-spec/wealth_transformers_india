import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { SideNav } from './SideNav';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { ShieldCheck, Wifi } from 'lucide-react';

export const PrivateLayout: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  // In development, allow bypass if needed for testing
  const isDev = import.meta.env.DEV;

  if (!isAuthenticated && !isDev) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-[#F5F5F7] dark:bg-[#0D0E12] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <SideNav />
      <div className="flex-1 flex flex-col min-w-0">
        {/* macOS Unified Top Titlebar Header */}
        <header className="sticky top-0 z-30 px-8 py-3 bg-[#F5F5F7]/80 dark:bg-[#0D0E12]/80 backdrop-blur-2xl border-b border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
              Meta Cloud API v22.0
            </span>
            <span className="hidden sm:inline-block text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              SEBI Compliant Outbound Dispatch Active
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5 font-medium text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-apple-blue dark:text-apple-blue-dark" />
              <span>DPDP Enforced</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-[11px]">
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span>WA-Sim Ready</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
