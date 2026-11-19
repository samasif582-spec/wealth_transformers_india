import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowRight, Sparkles, User, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../lib/api-client';
import { Badge } from '../../components/ui/Badge';

const PRESET_ROLES = [
  { role: 'Super_Admin', email: 'superadmin@wealthtrade.in', password: 'SuperAdmin@2026!', label: 'Super Admin', badge: 'danger' as const },
  { role: 'Admin', email: 'admin@wealthtrade.in', password: 'Admin@2026!', label: 'Admin (Supervisor)', badge: 'purple' as const },
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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 border border-slate-200 relative z-10 space-y-6">
        {/* Logo / Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex p-3 bg-blue-50 text-blue-600 rounded-2xl mb-2">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Wealth Trade Securities</h2>
          <p className="text-xs text-slate-500 font-medium">
            WhatsApp Customer Engagement & Automation Platform
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-200 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
              Corporate Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-900"
              placeholder="user@wealthtrade.in"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Master Security Password
              </label>
              <span className="text-[11px] text-slate-400 font-mono">Bcrypt-12 Hash</span>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-900"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? 'Verifying RS256 Tokens...' : 'Access Dedicated Role Dashboard'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* 1-Click Role Switcher Presets */}
        <div className="pt-4 border-t border-slate-100 space-y-2.5">
          <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
            One-Click Role Demonstration Presets:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_ROLES.map((preset) => (
              <button
                key={preset.role}
                type="button"
                onClick={() => selectPreset(preset)}
                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between text-xs ${
                  email === preset.email
                    ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div>
                  <p className="font-bold text-slate-900">{preset.label}</p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{preset.email}</p>
                </div>
                <Badge variant={preset.badge}>{preset.role}</Badge>
              </button>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400">
          SEBI Reg: INZ000123456 • DPDP Act 2023 Compliant • PostgreSQL Port 5435
        </div>
      </div>
    </div>
  );
};
