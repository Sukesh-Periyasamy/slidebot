import { useEffect, type ReactNode } from 'react';

import { useAuthStore, selectAuthStatus } from '@/features/auth/store/authStore';
import { sessionManager } from '../lib/sessionManager';
import { socketManager } from '../lib/socketManager';

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const authStatus = useAuthStore(selectAuthStatus);

  useEffect(() => {
    sessionManager.start();
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void socketManager.ensureConnected();
      return;
    }

    socketManager.disconnect();
    sessionManager.resetForLogout();
  }, [authStatus]);

  return <>{children}</>;
}
