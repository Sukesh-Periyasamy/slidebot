/**
 * WebSocket Monitor — debug utility for tracking socket listener counts.
 *
 * Purpose:
 * - Wraps socket.on/off to track how many listeners are registered per event.
 * - Exposes getReport() for test assertions and devtools inspection.
 * - Zero production overhead — only active in development/test environments.
 *
 * Usage in tests:
 *   const monitor = createWsMonitor(socket);
 *   // ... register listeners ...
 *   const report = monitor.getReport();
 *   expect(report['session:state']).toBe(1);
 *
 * Usage in devtools:
 *   import { globalWsMonitor } from '@/shared/utils/wsMonitor';
 *   console.log(globalWsMonitor.getReport());
 */

import type { Socket } from 'socket.io-client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface WsListenerReport {
  [event: string]: number;
}

export interface WsMonitor {
  getReport: () => WsListenerReport;
  reset: () => void;
  assertNoLeaks: (baseline?: WsListenerReport) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps a Socket.IO client socket to monitor listener registrations.
 * Returns the monitor and the patched socket reference.
 *
 * @param socket - The Socket.IO client socket to monitor.
 */
export function createWsMonitor(socket: Socket): WsMonitor {
  if (process.env.NODE_ENV === 'production') {
    // No-op in production — tree-shaken
    return {
      getReport: () => ({}),
      reset: () => {},
      assertNoLeaks: () => {},
    };
  }

  const counts: Record<string, number> = {};
  const originalOn = socket.on.bind(socket);
  const originalOff = socket.off.bind(socket);

  // Patch socket.on
  (socket as unknown as Record<string, unknown>)['on'] = (event: string, listener: unknown) => {
    counts[event] = (counts[event] ?? 0) + 1;
    return originalOn(event as never, listener as never);
  };

  // Patch socket.off
  (socket as unknown as Record<string, unknown>)['off'] = (event: string, listener: unknown) => {
    if (counts[event] && counts[event] > 0) {
      counts[event]--;
    }
    return originalOff(event as never, listener as never);
  };

  return {
    getReport: () => ({ ...counts }),
    reset: () => {
      Object.keys(counts).forEach((k) => delete counts[k]);
    },
    assertNoLeaks: (baseline?: WsListenerReport) => {
      const report = { ...counts };
      const leaks: string[] = [];

      for (const [event, count] of Object.entries(report)) {
        const base = baseline?.[event] ?? 0;
        if (count > base + 1) {
          leaks.push(`${event}: expected ≤${base + 1}, got ${count}`);
        }
      }

      if (leaks.length > 0) {
        throw new Error(`WebSocket listener leak detected:\n  ${leaks.join('\n  ')}`);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Global monitor (singleton for devtools access)
// ─────────────────────────────────────────────────────────────────────────────

let _globalMonitor: WsMonitor | null = null;

export function initGlobalWsMonitor(socket: Socket): WsMonitor {
  _globalMonitor = createWsMonitor(socket);
  return _globalMonitor;
}

export function getGlobalWsMonitor(): WsMonitor | null {
  return _globalMonitor;
}
