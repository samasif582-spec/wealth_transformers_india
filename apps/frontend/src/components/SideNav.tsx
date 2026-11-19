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
  LogOut,
  LucideIcon,
} from 'lucide-react';
import { useAuthStore, UserRole } from '../stores/auth.store';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  minRole: UserRole;
}

const ROLE_RANKS: Record<UserRole, number> = {
  Viewer: 1,
  Operator: 2,
  Marketing_Employee: 3,
  Admin: 4,
  Super_Admin: 5,
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, minRole: 'Viewer' },
  { label: 'Clients', path: '/clients', icon: Users, minRole: 'Operator' },
  { label: 'Templates', path: '/templates', icon: FileText, minRole: 'Marketing_Employee' },
  { label: 'Media Assets', path: '/media', icon: Image, minRole: 'Marketing_Employee' },
  { label: 'Campaigns', path: '/campaigns', icon: Send, minRole: 'Viewer' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, minRole: 'Viewer' },
  { label: 'Automation', path: '/automation', icon: Bot, minRole: 'Admin' },
  { label: 'Settings', path: '/settings', icon: Settings, minRole: 'Admin' },
  { label: 'Audit Log', path: '/audit', icon: Shield, minRole: 'Super_Admin' },
];

export const SideNav: React.FC = () => {
  const { user, clearSession } = useAuthStore();
  const userRank = user ? ROLE_RANKS[user.role] : 5; // Default to full rank for seamless experience

  const allowedNavItems = NAV_ITEMS.filter(
    (item) => userRank >= ROLE_RANKS[item.minRole],
  );

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col border-r border-slate-800 flex-shrink-0">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          Wealth Trade
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-medium">WhatsApp Engagement</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {allowedNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {user && (
        <div className="p-4 border-t border-slate-800 bg-slate-900/60">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">{user.fullName}</p>
              <p className="text-[11px] text-blue-400 font-medium truncate">{user.role}</p>
            </div>
            <button
              onClick={() => clearSession()}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
