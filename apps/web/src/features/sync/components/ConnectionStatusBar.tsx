import { AnimatePresence, motion } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { selectConnectionStatus, useSyncStore } from '../store/syncStore';
import type { ConnectionStatus } from '../store/syncStore';

// ─────────────────────────────────────────────────────────────────────────────
// ConnectionStatusBar — thin bar at the top of the room showing sync health
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ConnectionStatus,
  {
    label: string;
    color: string;
    bg: string;
    Icon: React.ElementType;
  }
> = {
  idle: {
    label: 'Connecting…',
    color: 'text-surface-400',
    bg: 'bg-surface-800',
    Icon: Wifi,
  },
  connecting: {
    label: 'Connecting…',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    Icon: RefreshCw,
  },
  connected: {
    label: 'Live',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    Icon: CheckCircle2,
  },
  reconnecting: {
    label: 'Reconnecting…',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    Icon: RefreshCw,
  },
  error: {
    label: 'Connection error',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    Icon: AlertTriangle,
  },
  disconnected: {
    label: 'Disconnected',
    color: 'text-surface-500',
    bg: 'bg-surface-800',
    Icon: WifiOff,
  },
};

export function ConnectionStatusBar() {
  const status = useSyncStore(selectConnectionStatus);
  const reconnectAttempts = useSyncStore((s) => s.reconnectAttempts);
  const config = STATUS_CONFIG[status];
  const { Icon, label, color, bg } = config;

  // Only show when not connected
  const shouldShow = status !== 'connected';

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={`overflow-hidden ${bg}`}
        >
          <div
            className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium ${color}`}
          >
            <Icon
              size={12}
              className={status === 'reconnecting' || status === 'connecting' ? 'animate-spin' : ''}
            />
            <span>
              {label}
              {(status === 'reconnecting' || status === 'error') && reconnectAttempts > 0 && (
                <span className="ml-1 text-surface-500">(attempt {reconnectAttempts})</span>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
