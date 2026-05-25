import { create } from 'zustand';

export interface RealtimeMetrics {
  socketStatus: 'connected' | 'disconnected' | 'reconnecting';
  bytesReceived: number;
  bytesSent: number;
  eventsReceived: number;
  eventsSent: number;
  droppedPackets: number;
  replayQueueDepth: number;
  lastPingMs: number;
}

interface RealtimeDebugStore {
  metrics: RealtimeMetrics;
  updateMetrics: (updates: Partial<RealtimeMetrics>) => void;
  incrementBytes: (type: 'sent' | 'received', amount: number) => void;
  incrementEvents: (type: 'sent' | 'received') => void;
  recordPing: (ms: number) => void;
  recordDroppedPacket: () => void;
  updateQueueDepth: (depth: number) => void;
}

export const useRealtimeDebugStore = create<RealtimeDebugStore>((set) => ({
  metrics: {
    socketStatus: 'disconnected',
    bytesReceived: 0,
    bytesSent: 0,
    eventsReceived: 0,
    eventsSent: 0,
    droppedPackets: 0,
    replayQueueDepth: 0,
    lastPingMs: 0,
  },
  updateMetrics: (updates) =>
    set((state) => ({
      metrics: { ...state.metrics, ...updates },
    })),
  incrementBytes: (type, amount) =>
    set((state) => ({
      metrics: {
        ...state.metrics,
        [type === 'sent' ? 'bytesSent' : 'bytesReceived']:
          state.metrics[type === 'sent' ? 'bytesSent' : 'bytesReceived'] + amount,
      },
    })),
  incrementEvents: (type) =>
    set((state) => ({
      metrics: {
        ...state.metrics,
        [type === 'sent' ? 'eventsSent' : 'eventsReceived']:
          state.metrics[type === 'sent' ? 'eventsSent' : 'eventsReceived'] + 1,
      },
    })),
  recordPing: (ms) =>
    set((state) => ({
      metrics: { ...state.metrics, lastPingMs: ms },
    })),
  recordDroppedPacket: () =>
    set((state) => ({
      metrics: { ...state.metrics, droppedPackets: state.metrics.droppedPackets + 1 },
    })),
  updateQueueDepth: (depth) =>
    set((state) => ({
      metrics: { ...state.metrics, replayQueueDepth: depth },
    })),
}));
