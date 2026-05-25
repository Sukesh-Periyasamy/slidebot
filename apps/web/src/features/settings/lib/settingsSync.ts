import { useSettingsStore, SlideBotSettings } from '../store/settingsStore';
import { useAuthStore } from '@/features/auth/store/authStore';

let timeoutId: number | null = null;

async function syncSettingsToServer(settings: SlideBotSettings) {
  const token = useAuthStore.getState().token;
  if (!token) return;

  try {
    const res = await fetch('/api/v1/users/me/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ payload: settings })
    });
    
    if (!res.ok) {
      console.warn('Failed to sync settings to server');
    }
  } catch (err) {
    console.error('Settings sync error:', err);
  }
}

export function initSettingsSync() {
  useSettingsStore.subscribe((state, prevState) => {
    // Only sync if settings changed, not just onboarding state
    if (state.settings !== prevState.settings) {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      
      timeoutId = window.setTimeout(() => {
        syncSettingsToServer(state.settings);
      }, 2000);
    }
  });
}
