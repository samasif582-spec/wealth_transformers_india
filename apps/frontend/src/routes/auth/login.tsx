import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../lib/api-client';
import { Badge } from '../../components/ui/Badge';
import { WealthTransformersLogo } from '../../components/brand/WealthTransformersLogo';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

const PRESET_ROLES = [
  { role: 'Super_Admin', email: 'superadmin@wealthtrade.in', password: 'SuperAdmin@2026!', label: 'Super Admin', badge: 'danger' as const },
  { role: 'Admin', email: 'admin@wealthtrade.in', password: 'Admin@2026!', label: 'Admin (Operations)', badge: 'purple' as const },
  { role: 'Marketing_Employee', email: 'marketing@wealthtrade.in', password: 'Marketing@2026!', label: 'Marketing Growth', badge: 'info' as const },
  { role: 'Operator', email: 'operator@wealthtrade.in', password: 'Operator@2026!', label: 'Ops & BullMQ', badge: 'warning' as const },
  { role: 'Viewer', email: 'viewer@wealthtrade.in', password: 'Viewer@2026!', label: 'Viewer (Audit)', badge: 'default' as const },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('superadmin@wealthtrade.in');
  const [password, setPassword] = useState('SuperAdmin@2026!');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<{
        accessToken: string;
        user: { id: string; email: string; fullName: string; role: any };
      }>('/auth/login', { email, password });

      setUser(response.data.user, response.data.accessToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectPreset = (preset: typeof PRESET_ROLES[0]) => {
    setEmail(preset.email);
    setPassword(preset.password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 relative overflow-hidden transition-colors duration-200">
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 border border-slate-200 dark:border-slate-800 relative z-10 space-y-6 transition-colors">
        {/* Logo / Header */}
        <WealthTransformersLogo variant="hero" />

        {error && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs rounded-xl border border-rose-200 dark:border-rose-900 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Corporate Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-slate-900 dark:text-white"
              placeholder="user@wealthtransformers.in"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                Master Security Password
              </label>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Bcrypt-12</span>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-medium text-slate-900 dark:text-white"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? 'Verifying RS256 Tokens...' : 'Access Dedicated Role Dashboard'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* 1-Click Role Switcher Presets */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <span className="text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500 block tracking-wider">
            One-Click Role Demonstration Presets:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_ROLES.map((preset) => (
              <button
                key={preset.role}
                type="button"
                onClick={() => selectPreset(preset)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between text-xs cursor-pointer ${
                  email === preset.email
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40'
                }`}
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">{preset.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">{preset.email}</p>
                </div>
                <Badge variant={preset.badge}>{preset.role}</Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          Wealth Transformers India Pvt Ltd • SEBI & DPDP Regulated
        </div>
      </div>
    </div>
  );
};
