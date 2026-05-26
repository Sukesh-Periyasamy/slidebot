import { create } from 'zustand';

interface ThemeState {
  theme: 'light' | 'dark' | 'system';
  branding: 'default' | 'ocean' | 'ruby' | 'forest';
  density: 'comfortable' | 'compact';
  setTheme: (theme: ThemeState['theme']) => void;
  setBranding: (branding: ThemeState['branding']) => void;
  setDensity: (density: ThemeState['density']) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'dark',
  branding: 'default',
  density: 'comfortable',
  setTheme: (theme) => set({ theme }),
  setBranding: (branding) => set({ branding }),
  setDensity: (density) => set({ density }),
}));
