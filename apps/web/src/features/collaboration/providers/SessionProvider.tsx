import { useEffect, type ReactNode } from 'react';
import { recordRenderCount } from '@/features/debug/lib/renderInspector';

import { useAuthStore, selectAuthStatus } from '@/features/auth/store/authStore';
import { sessionManager } from '../lib/sessionManager';
import { socketManager } from '../lib/socketManager';
import { presenceManager } from '@/features/presence/lib/presenceManager';
import { cursorManager } from '@/features/cursors/lib/cursorManager';

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const authStatus = useAuthStore(selectAuthStatus);

  if (import.meta.env.DEV) {
    recordRenderCount('SESSION_PROVIDER_RENDER');
  }

  useEffect(() => {
    sessionManager.start();
    presenceManager.start();
    cursorManager.start();
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      presenceManager.start();
      cursorManager.start();
      void socketManager.ensureConnected();
      return;
    }

    socketManager.disconnect();
    sessionManager.resetForLogout();
    presenceManager.reset();
    cursorManager.reset();
  }, [authStatus]);

  return <>{children}</>;
}
