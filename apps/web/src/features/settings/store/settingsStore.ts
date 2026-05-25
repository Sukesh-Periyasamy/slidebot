import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SlideBotSettings {
  // Appearance
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  
  // Collaboration
  showCursors: boolean;
  bandwidthSaver: boolean;
  
  // Presenter
  laserPointerColor: string;
  autoHideToolbar: boolean;
  
  // Notifications
  enableToasts: boolean;
  soundEnabled: boolean;
  
  // Accessibility
  highContrast: boolean;
  fontScaling: number;
}

const defaultSettings: SlideBotSettings = {
  theme: 'system',
  reducedMotion: false,
  showCursors: true,
  bandwidthSaver: false,
  laserPointerColor: '#ff0000',
  autoHideToolbar: false,
  enableToasts: true,
  soundEnabled: true,
  highContrast: false,
  fontScaling: 100,
};

interface SettingsState {
  settings: SlideBotSettings;
  updateSetting: <K extends keyof SlideBotSettings>(key: K, value: SlideBotSettings[K]) => void;
  resetSettings: () => void;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      hasCompletedOnboarding: false,

      updateSetting: (key, value) => 
        set((state) => ({
          settings: {
            ...state.settings,
            [key]: value,
          }
        })),
        
      resetSettings: () => set({ settings: defaultSettings }),
      
      completeOnboarding: () => set({ hasCompletedOnboarding: true })
    }),
    {
      name: 'slidebot-settings',
      // We will sync settings to the server using a separate mechanism (settingsSync)
    }
  )
);
