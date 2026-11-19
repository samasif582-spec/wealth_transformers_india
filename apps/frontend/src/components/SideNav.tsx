import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Image,
  Send,
  BarChart3,
  Bot,
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
  Viewer: 1,
  Operator: 2,
  Marketing_Employee: 3,
  Admin: 4,
  Super_Admin: 5,
};

// Admin holds: Dashboard, Clients, Templates, Media Assets, Campaigns, Bills
// Super Admin holds ALL plus exclusive: Analytics, Automation, Audit Log
const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, minRole: 'Viewer' },
  { label: 'Clients', path: '/clients', icon: Users, minRole: 'Operator' },
  { label: 'Templates', path: '/templates', icon: FileText, minRole: 'Marketing_Employee' },
  { label: 'Media Assets', path: '/media', icon: Image, minRole: 'Marketing_Employee' },
  { label: 'Campaigns', path: '/campaigns', icon: Send, minRole: 'Viewer' },
  { label: 'Bills', path: '/billing', icon: Receipt, allowedRoles: ['Admin', 'Super_Admin'] },
  {
    label: 'Analytics',
    path: '/analytics',
    icon: BarChart3,
    allowedRoles: ['Super_Admin'],
    superAdminOnly: true,
    badge: 'Super Admin',
  },
  {
    label: 'Automation',
    path: '/automation',
    icon: Bot,
    allowedRoles: ['Super_Admin'],
    superAdminOnly: true,
    badge: 'Super Admin',
  },
  { label: 'Settings', path: '/settings', icon: Settings, allowedRoles: ['Admin', 'Super_Admin'] },
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
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col border-r border-slate-800 flex-shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800">
        <WealthTransformersLogo variant="horizontal" showSubtitle={true} />
      </div>

      {/* Role Pill Banner */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
          Navigation
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            currentRole === 'Super_Admin'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
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
                `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all group ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`
              }
            >
              <div className="flex items-center gap-3 truncate">
                <Icon className="w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110" />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer User Info & Theme Toggle */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Appearance
          </span>
          <ThemeToggle />
        </div>

        {user && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/70">
            <div className="truncate mr-2">
              <p className="text-xs font-bold text-white truncate">{user.fullName || user.email}</p>
              <p className="text-[11px] text-emerald-400 font-semibold truncate">
                {user.role === 'Super_Admin' ? 'Super Administrator' : 'Operations Admin'}
              </p>
            </div>
            <button
              onClick={() => clearSession()}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors flex-shrink-0"
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
