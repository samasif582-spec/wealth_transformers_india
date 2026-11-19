import React, { Suspense, lazy } from 'react';
import { useAuthStore, UserRole } from '../../stores/auth.store';

const SuperAdminDashboard = lazy(() =>
  import('./SuperAdminDashboard').then((m) => ({ default: m.SuperAdminDashboard })),
);
const AdminDashboard = lazy(() =>
  import('./AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);
const MarketingDashboard = lazy(() =>
  import('./MarketingDashboard').then((m) => ({ default: m.MarketingDashboard })),
);
const OperatorDashboard = lazy(() =>
  import('./OperatorDashboard').then((m) => ({ default: m.OperatorDashboard })),
);
const ViewerDashboard = lazy(() =>
  import('./ViewerDashboard').then((m) => ({ default: m.ViewerDashboard })),
);

const LoadingSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-8 bg-slate-200 rounded w-1/3"></div>
    <div className="grid grid-cols-4 gap-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-28 bg-slate-200 rounded-xl"></div>
      ))}
    </div>
    <div className="h-64 bg-slate-200 rounded-xl"></div>
  </div>
);

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const role: UserRole = user?.role ?? 'Super_Admin';

  const renderDashboard = () => {
    switch (role) {
      case 'Super_Admin':
        return <SuperAdminDashboard />;
      case 'Admin':
        return <AdminDashboard />;
      case 'Marketing_Employee':
        return <MarketingDashboard />;
      case 'Operator':
        return <OperatorDashboard />;
      case 'Viewer':
      default:
        return <ViewerDashboard />;
    }
  };

  return <Suspense fallback={<LoadingSkeleton />}>{renderDashboard()}</Suspense>;
};
