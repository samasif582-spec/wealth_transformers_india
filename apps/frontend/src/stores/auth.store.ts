import { create } from 'zustand';

export type UserRole =
  | 'Super_Admin'
  | 'Admin'
  | 'Marketing_Employee'
  | 'Operator'
  | 'Viewer';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthState {
  user: User | null;
  activeRole: UserRole | null;
  accessToken: string | null; // Kept in memory ONLY (never localStorage)
  isAuthenticated: boolean;
  setUser: (user: User, accessToken: string) => void;
  clearSession: () => void;
  setAccessToken: (token: string) => void;
  switchRole: (role: UserRole) => void;
}

export const useAuthStore = create<AuthState>((set: any) => ({
  user: null,
  activeRole: null,
  accessToken: null,
  isAuthenticated: false,
  setUser: (user: User, accessToken: string) =>
    set({ user, activeRole: user.role, accessToken, isAuthenticated: true }),
  clearSession: () =>
    set({ user: null, activeRole: null, accessToken: null, isAuthenticated: false }),
  setAccessToken: (token: string) =>
    set({ accessToken: token, isAuthenticated: true }),
  switchRole: (role: UserRole) =>
    set((state: AuthState) => ({
      activeRole: role,
      user: state.user ? { ...state.user, role } : { id: 'dev-user', email: 'dev@wealthtrade.in', fullName: 'Dev User', role },
    })),
}));
