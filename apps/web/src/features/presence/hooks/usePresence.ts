import { useShallow } from 'zustand/react/shallow';

import { usePresenceStore, selectPresenceSummary } from '../store/presenceStore';

export function usePresence() {
  return usePresenceStore(useShallow(selectPresenceSummary));
}
