import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UIDensity } from '@/shared/utils/responsive';

export interface SlideBotSettings {
  // Appearance
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  density: UIDensity;
  
  // Collaboration
  showCursors: boolean;
  showParticipantActivity: boolean;
  cursorAnimation: boolean;
  annotationSmoothing: boolean;
  
  // Performance
  bandwidthSaver: boolean;
  adaptiveRendering: boolean;
  replayQuality: 'low' | 'medium' | 'high';
  lowMemoryMode: boolean;
  liveThumbnails: boolean;
  
  // Notifications
  enableToasts: boolean;
  soundEnabled: boolean;
  quietMode: boolean;
  reconnectAlerts: boolean;
  handoffAlerts: boolean;
  inviteNotifications: boolean;
  
  // Accessibility
  highContrast: boolean;
  fontScaling: number;
  keyboardNavigation: boolean;
  focusRingVisibility: boolean;
  
  // Presenter Controls
  laserPointerColor: string;
  autoHideToolbar: boolean;
  autoFullscreen: boolean;
  timerPersistence: boolean;
  audienceModeDefaults: boolean;
  quickHandoff: boolean;
}

const defaultSettings: SlideBotSettings = {
  theme: 'system',
  reducedMotion: false,
  density: 'comfortable',
  
  showCursors: true,
  showParticipantActivity: true,
  cursorAnimation: true,
  annotationSmoothing: true,
  
  bandwidthSaver: false,
  adaptiveRendering: true,
  replayQuality: 'high',
  lowMemoryMode: false,
  liveThumbnails: true,
  
  enableToasts: true,
  soundEnabled: true,
  quietMode: false,
  reconnectAlerts: true,
  handoffAlerts: true,
  inviteNotifications: true,
  
  highContrast: false,
  fontScaling: 100,
  keyboardNavigation: false,
  focusRingVisibility: true,
  
  laserPointerColor: '#ff0000',
  autoHideToolbar: false,
  autoFullscreen: false,
  timerPersistence: true,
  audienceModeDefaults: true,
  quickHandoff: false,
};

interface SettingsState {
  settings: SlideBotSettings;
  updateSetting: <K extends keyof SlideBotSettings>(key: K, value: SlideBotSettings[K]) => void;
  updateSettings: (partial: Partial<SlideBotSettings>) => void;
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
        
      updateSettings: (partial) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...partial,
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
