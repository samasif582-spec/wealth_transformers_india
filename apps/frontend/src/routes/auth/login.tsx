import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Mail, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../lib/api-client';
import { WealthTransformersLogo } from '../../components/brand/WealthTransformersLogo';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
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
      setError(err.response?.data?.message || 'Access denied. Please verify your corporate email and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#000000] p-4 relative overflow-hidden transition-colors duration-300 font-sans">
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      {/* Security Status Pill Top-Left */}
      <div className="absolute top-6 left-6 z-20 hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 dark:bg-white/10 border border-black/[0.06] dark:border-white/[0.1] backdrop-blur-xl shadow-xs">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 tracking-wide uppercase font-mono">
          256-Bit SSL • SEBI INZ000123456
        </span>
      </div>

      {/* Apple Iridescent Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[540px] h-[540px] bg-apple-blue/10 dark:bg-apple-blue/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 -translate-x-1/2 w-[540px] h-[540px] bg-apple-emerald/10 dark:bg-apple-emerald/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphic Login Card */}
      <div className="w-full max-w-[420px] bg-white/90 dark:bg-[#16181D]/90 backdrop-blur-3xl rounded-[32px] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.30)] p-7 sm:p-9 border border-black/[0.08] dark:border-white/[0.12] relative z-10 space-y-6 transition-all duration-300 animate-in fade-in zoom-in-95 duration-500">
        {/* Brand Hero Logo */}
        <WealthTransformersLogo variant="hero" />

        {/* Heading */}
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Operations & Advisory Console
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Authorized personnel login for Wealth Transformers
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs rounded-2xl border border-rose-500/20 font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Corporate Email Field */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Corporate Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-4 focus:ring-apple-blue/20 focus:border-apple-blue text-xs font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="name@wealthtransformers.in"
              />
            </div>
          </div>

          {/* Master Password Field */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Security Password
              </label>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> SHA-256 / Bcrypt
              </span>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] rounded-xl focus:outline-none focus:ring-4 focus:ring-apple-blue/20 focus:border-apple-blue text-xs font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember Me & Notice */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded-md border-black/[0.15] dark:border-white/[0.2] text-apple-blue focus:ring-apple-blue/30 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Remember this workstation
              </span>
            </label>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">
              Audit Active
            </span>
          </div>

          {/* Apple Vibrant Blue CTA */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-b from-[#0077ED] to-[#0071E3] hover:from-[#0A84FF] hover:to-[#0077ED] text-white font-semibold rounded-full text-xs transition-all shadow-md shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-white/20"
          >
            {isLoading ? 'Verifying Clearance...' : 'Authenticate & Enter Console'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Regulatory Governance Footer */}
        <div className="pt-4 border-t border-black/[0.06] dark:border-white/[0.08] text-center space-y-1">
          <p className="text-[10.5px] text-slate-400 dark:text-slate-500 font-medium">
            Wealth Transformers India Pvt Ltd • SEBI & DPDP Regulated
          </p>
          <p className="text-[9.5px] text-slate-400 dark:text-slate-600">
            SEBI Reg: INZ000123456 | AMFI: ARN-98765
          </p>
        </div>
      </div>
    </div>
  );
};
