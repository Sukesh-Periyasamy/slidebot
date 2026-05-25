import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { useCursorStore } from '@/features/cursors/store/cursorStore';
import { usePresenceStore } from '@/features/presence/store/presenceStore';

import { getRenderCounts } from '../lib/renderInspector';
import { inspectListeners, type ListenerSnapshot } from '../lib/listenerInspector';
import { inspectSockets, type SocketInspectorSnapshot } from '../lib/socketInspector';

interface DebugSnapshot {
  updatedAt: number;
  renderCounts: Record<string, number>;
  listeners: ListenerSnapshot[];
  sockets: SocketInspectorSnapshot;
  presenceCount: number;
  cursorCount: number;
}

interface DebugState extends DebugSnapshot {
  refresh: () => void;
}

const initialSnapshot: DebugSnapshot = {
  updatedAt: 0,
  renderCounts: {},
  listeners: [],
  sockets: {
    status: 'idle',
    reconnectAttempts: 0,
    hasReconnected: false,
    heartbeatHealthy: true,
    sockets: [],
  },
  presenceCount: 0,
  cursorCount: 0,
};

export const useDebugStore = create<DebugState>()(
  devtools((set) => ({
    ...initialSnapshot,
    refresh: () =>
      set({
        updatedAt: Date.now(),
        renderCounts: getRenderCounts(),
        listeners: inspectListeners(),
        sockets: inspectSockets(),
        presenceCount: Object.keys(usePresenceStore.getState().participants).length,
        cursorCount: Object.keys(useCursorStore.getState().cursors).length,
      }),
  }))
);
