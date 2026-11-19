import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs: number;
  dismissible: boolean;
  createdAt: number;
}

export const MAX_TOASTS = 5;

export function calculateToastProgress(elapsed: number, totalDuration: number): number {
  if (totalDuration <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - elapsed / totalDuration) * 100)));
}

export function shouldDismissSwipe(deltaX: number, threshold = 100): boolean {
  return Math.abs(deltaX) > threshold;
}

interface ToastState {
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id' | 'createdAt'> & { id?: string }) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set: any) => ({
  toasts: [],
  addToast: (toast: Omit<ToastNotification, 'id' | 'createdAt'> & { id?: string }) =>
    set((state: ToastState) => {
      const newToast: ToastNotification = {
        ...toast,
        id: toast.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: Date.now(),
      };
      const updated = [...state.toasts, newToast];
      // Keep strictly maximum MAX_TOASTS (FIFO eviction)
      return { toasts: updated.slice(-MAX_TOASTS) };
    }),
  removeToast: (id: string) =>
    set((state: ToastState) => ({
      toasts: state.toasts.filter((t: ToastNotification) => t.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));
