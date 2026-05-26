import { create } from 'zustand';

interface AdminState {
  retentionDays: number;
  ssoEnabled: boolean;
  ssoProvider: string | null;
  setRetentionDays: (days: number) => void;
  setSsoEnabled: (enabled: boolean) => void;
  setSsoProvider: (provider: string | null) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  retentionDays: 90,
  ssoEnabled: false,
  ssoProvider: null,
  setRetentionDays: (days) => set({ retentionDays: days }),
  setSsoEnabled: (enabled) => set({ ssoEnabled: enabled }),
  setSsoProvider: (provider) => set({ ssoProvider: provider }),
}));
