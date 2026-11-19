import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { SideNav } from './SideNav';

export const PrivateLayout: React.FC = () => {
  const { isAuthenticated } = useAuthStore();

  // In development, allow bypass if needed for testing
  const isDev = import.meta.env.DEV;

  if (!isAuthenticated && !isDev) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <SideNav />
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
