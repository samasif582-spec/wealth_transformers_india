import { create } from 'zustand';

export type DrawerType = 'client' | 'template' | 'settings' | null;

interface DrawerState {
  isOpen: boolean;
  drawerType: DrawerType;
  drawerData: any;
  openDrawer: (type: DrawerType, data?: any) => void;
  closeDrawer: () => void;
}

export const useDrawerStore = create<DrawerState>((set: any) => ({
  isOpen: false,
  drawerType: null,
  drawerData: null,
  openDrawer: (type: DrawerType, data: any = null) =>
    set({
      isOpen: true,
      drawerType: type,
      drawerData: data,
    }),
  closeDrawer: () =>
    set({
      isOpen: false,
      drawerType: null,
      drawerData: null,
    }),
}));
