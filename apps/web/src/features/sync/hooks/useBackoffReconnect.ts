import { useCallback } from 'react';

import { socketManager } from '@/features/collaboration/lib/socketManager';
import { useSyncStore } from '../store/syncStore';

const MAX_ATTEMPTS = 15;

export interface BackoffState {
  isReconnecting: boolean;
  attempt: number;
  maxAttempts: number;
  nextRetryInMs: number;
  hasGivenUp: boolean;
  manualRetry: () => void;
}

export function useBackoffReconnect(): BackoffState {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const attempt = useSyncStore((s) => s.reconnectAttempts);

  const manualRetry = useCallback(() => {
    void socketManager.forceReconnect();
  }, []);

  return {
    isReconnecting: connectionStatus === 'reconnecting' || connectionStatus === 'connecting',
    attempt,
    maxAttempts: MAX_ATTEMPTS,
    nextRetryInMs: 0,
    hasGivenUp: connectionStatus === 'error' && attempt >= MAX_ATTEMPTS,
    manualRetry,
  };
}
