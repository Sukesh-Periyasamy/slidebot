/**
 * ConnectionHealth — compact latency/status indicator for the room header.
 *
 * Shows:
 * - Green dot + latency ms when healthy
 * - Amber dot when latency is high (>200ms) or reconnecting
 * - Red dot on error/disconnected
 */

import { memo } from 'react';
import { useHeartbeatState } from '../hooks/useHeartbeatState';
import { useSyncStore } from '../store/syncStore';

interface ConnectionHealthProps {
  /** Show latency number beside the dot (default: true) */
  showLatency?: boolean;
}

export const ConnectionHealth = memo(function ConnectionHealth({
  showLatency = true,
}: ConnectionHealthProps) {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const { latencyMs } = useHeartbeatState();

  const isHighLatency = latencyMs !== null && latencyMs > 200;

  let dotColor = 'bg-surface-600';
  let label = 'Offline';

  switch (connectionStatus) {
    case 'connected':
      dotColor = isHighLatency ? 'bg-amber-400' : 'bg-emerald-400';
      label = latencyMs !== null ? `${latencyMs}ms` : 'Live';
      break;
    case 'reconnecting':
    case 'connecting':
      dotColor = 'bg-amber-400 animate-pulse';
      label = 'Reconnecting';
      break;
    case 'error':
      dotColor = 'bg-red-500';
      label = 'Error';
      break;
  }

  return (
    <div
      className="flex items-center gap-1.5"
      title={`Connection: ${connectionStatus}${latencyMs !== null ? ` (${latencyMs}ms)` : ''}`}
      aria-label={`Connection status: ${label}`}
    >
      <span className={`block w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
      {showLatency && <span className="text-xs text-surface-400 tabular-nums">{label}</span>}
    </div>
  );
});
