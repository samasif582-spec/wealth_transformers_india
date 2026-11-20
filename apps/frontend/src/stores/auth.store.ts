import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole = 'Super_Admin' | 'Admin';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

interface AuthState {
  user: User | null;
  activeRole: UserRole | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: User, accessToken: string, refreshToken?: string) => void;
  clearSession: () => void;
  setTokens: (accessToken: string, refreshToken?: string) => void;
  switchRole: (role: UserRole) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      activeRole: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setUser: (user: User, accessToken: string, refreshToken?: string) =>
        set({
          user,
          activeRole: user.role,
          accessToken,
          refreshToken: refreshToken || get().refreshToken,
          isAuthenticated: true,
        }),
      clearSession: () => {
        localStorage.removeItem('wt_auth_session');
        set({
          user: null,
          activeRole: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
      setTokens: (accessToken: string, refreshToken?: string) =>
        set((state) => ({
          accessToken,
          refreshToken: refreshToken || state.refreshToken,
          isAuthenticated: true,
        })),
      switchRole: (role: UserRole) =>
        set((state) => ({
          activeRole: role,
          user: state.user
            ? { ...state.user, role }
            : { id: 'dev-user', email: 'admin@wealthtrade.in', fullName: 'Dev Admin', role },
        })),
    }),
    {
      name: 'wt_auth_session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
