import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Image,
  Send,
  BarChart3,
  MessageSquare,
  Settings,
  Shield,
  Receipt,
  LogOut,
  LucideIcon,
  Sparkles,
} from 'lucide-react';
import { useAuthStore, UserRole } from '../stores/auth.store';
import { WealthTransformersLogo } from './brand/WealthTransformersLogo';
import { ThemeToggle } from './ui/ThemeToggle';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  minRole?: UserRole;
  allowedRoles?: UserRole[];
  badge?: string;
  superAdminOnly?: boolean;
}

const ROLE_RANKS: Record<UserRole, number> = {
  Admin: 1,
  Super_Admin: 2,
};

// Streamlined Navigation for Wealth Transformers Stock-Broking Platform
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', path: '/clients', icon: Users },
  { label: 'Templates & Offers', path: '/templates', icon: FileText },
  { label: 'Send Broadcast', path: '/campaigns', icon: Send },
  { label: 'Custom Messages', path: '/messages', icon: MessageSquare },
  {
    label: 'Bills',
    path: '/billing',
    icon: Receipt,
    allowedRoles: ['Admin'],
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    allowedRoles: ['Super_Admin'],
    superAdminOnly: true,
  },
  {
    label: 'Audit Log',
    path: '/audit',
    icon: Shield,
    allowedRoles: ['Super_Admin'],
    superAdminOnly: true,
  },
];

export const SideNav: React.FC = () => {
  const { user, clearSession } = useAuthStore();
  const currentRole: UserRole = user?.role || 'Admin';
  const userRank = user ? ROLE_RANKS[user.role] : 4;

  const allowedNavItems = NAV_ITEMS.filter((item) => {
    // If specific allowed roles are provided, check exact membership
    if (item.allowedRoles) {
      return item.allowedRoles.includes(currentRole);
    }
    // If superAdminOnly flag is present
    if (item.superAdminOnly) {
      return currentRole === 'Super_Admin';
    }
    // Otherwise fallback to minRole ranking
    if (item.minRole) {
      return userRank >= ROLE_RANKS[item.minRole];
    }
    return true;
  });

  return (
    <aside className="w-64 bg-[#FBFBFD]/85 dark:bg-[#121418]/85 backdrop-blur-2xl text-slate-800 dark:text-slate-100 min-h-screen flex flex-col border-r border-black/[0.06] dark:border-white/[0.08] flex-shrink-0 select-none transition-colors duration-200">
      {/* Brand Header */}
      <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.06]">
        <WealthTransformersLogo variant="horizontal" showSubtitle={true} />
      </div>

      {/* Role Pill Banner */}
      <div className="px-4 pt-3.5 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-400">
          Navigation
        </span>
        <span
          className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full backdrop-blur-xs ${
            currentRole === 'Super_Admin'
              ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border border-amber-500/25'
              : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25'
          }`}
        >
          {currentRole === 'Super_Admin' ? 'Super Admin' : 'Admin View'}
        </span>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {allowedNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-black/[0.06] dark:bg-white/[0.12] text-slate-900 dark:text-white font-semibold shadow-xs border border-black/[0.04] dark:border-white/[0.08]'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-black/[0.03] dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white border border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? 'text-apple-blue dark:text-apple-blue-dark' : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-apple-blue dark:bg-apple-blue-dark shadow-[0_0_6px_rgba(0,113,227,0.7)]" />
                  )}
                  {item.badge && !isActive && (
                    <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-300 border border-amber-400/30">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer User Info & Theme Toggle */}
      <div className="p-3 border-t border-black/[0.05] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-apple-emerald" />
            Appearance
          </span>
          <ThemeToggle />
        </div>

        {user && (
          <div className="flex items-center justify-between pt-2 border-t border-black/[0.05] dark:border-white/[0.06]">
            <div className="flex items-center gap-2.5 truncate mr-2">
              <div className="w-7 h-7 rounded-full bg-apple-blue/15 text-apple-blue dark:text-apple-blue-dark flex items-center justify-center font-bold text-xs flex-shrink-0 border border-apple-blue/20">
                {(user.fullName || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{user.fullName || user.email}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">
                  {user.role === 'Super_Admin' ? 'Super Administrator' : 'Operations Admin'}
                </p>
              </div>
            </div>
            <button
              onClick={() => clearSession()}
              className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors flex-shrink-0 cursor-pointer"
              title="Logout from system"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
