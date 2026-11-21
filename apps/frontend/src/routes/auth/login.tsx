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
        refreshToken: string;
        user: { id: string; email: string; fullName: string; role: any };
      }>('/auth/login', { email, password });

      setUser(response.data.user, response.data.accessToken, response.data.refreshToken);
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
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0D0E12] p-4 relative overflow-hidden transition-colors duration-200">
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Apple Iridescent Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-apple-blue/10 dark:bg-apple-blue/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-[500px] h-[500px] bg-apple-emerald/10 dark:bg-apple-emerald/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/85 dark:bg-[#1C1E24]/85 backdrop-blur-3xl rounded-[32px] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.35)] p-8 border border-black/[0.08] dark:border-white/[0.12] relative z-10 space-y-6 transition-all">
        {/* Logo / Header */}
        <WealthTransformersLogo variant="hero" />

        {error && (
          <div className="p-3.5 bg-rose-500/12 text-rose-700 dark:text-rose-300 text-xs rounded-2xl border border-rose-500/20 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Corporate Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-4 focus:ring-apple-blue/20 focus:border-apple-blue text-xs font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
              placeholder="user@wealthtransformers.in"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Master Security Password
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Bcrypt-12</span>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-4 focus:ring-apple-blue/20 focus:border-apple-blue text-xs font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-gradient-to-b from-[#0077ED] to-[#0071E3] hover:from-[#0A84FF] hover:to-[#0077ED] text-white font-semibold rounded-full text-xs transition-all shadow-md shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-white/20"
          >
            {isLoading ? 'Verifying Tokens...' : 'Access Dedicated Role Dashboard'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* 1-Click Role Switcher Presets */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] space-y-2.5">
          <span className="text-[10.5px] font-semibold uppercase text-slate-400 dark:text-slate-400 block tracking-wider">
            One-Click Role Demonstration Presets:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_ROLES.map((preset) => (
              <button
                key={preset.role}
                type="button"
                onClick={() => selectPreset(preset)}
                className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between text-xs cursor-pointer ${
                  email === preset.email
                    ? 'border-apple-blue bg-apple-blue/10 dark:bg-apple-blue/15 shadow-xs'
                    : 'border-black/[0.06] dark:border-white/[0.08] hover:border-black/[0.12] dark:hover:border-white/[0.16] bg-black/[0.02] dark:bg-white/[0.04]'
                }`}
              >
                <div className="truncate mr-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{preset.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">{preset.email}</p>
                </div>
                <Badge variant={preset.badge}>{preset.role}</Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[10.5px] text-slate-400 dark:text-slate-400 font-medium">
          Wealth Transformers India Pvt Ltd • SEBI & DPDP Regulated
        </div>
      </div>
    </div>
  );
};
