import { useSyncExternalStore } from 'react';

import { heartbeatManager } from '@/features/collaboration/lib/heartbeatManager';

export function useHeartbeatState() {
  return useSyncExternalStore(
    (listener) => heartbeatManager.subscribe(listener),
    () => heartbeatManager.getState(),
    () => heartbeatManager.getState()
  );
}
