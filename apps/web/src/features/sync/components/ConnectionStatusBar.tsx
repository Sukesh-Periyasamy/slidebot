import { AnimatePresence, motion } from 'framer-motion';
import { recordRenderCount } from '@/features/debug/lib/renderInspector';
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
  if (import.meta.env.DEV) {
    recordRenderCount('CONNECTION_STATUS_BAR_RENDER');
  }

  const status = useSyncStore(selectConnectionStatus);
  const reconnectAttempts = useSyncStore((s) => s.reconnectAttempts);
  const config = STATUS_CONFIG[status];
  const { Icon, label, color, bg } = config;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <AnimatePresence mode="wait">
        {status !== 'connected' && (
          <motion.div
            key="status-pill"
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 shadow-md border ${bg} ${
              status === 'reconnecting' ? 'border-amber-500/30 shadow-amber-500/10' : 'border-surface-800'
            } backdrop-blur-md`}
          >
            {status === 'reconnecting' ? (
              <div className="relative flex h-2 w-2 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"></span>
              </div>
            ) : (
              <Icon size={14} className={color} />
            )}
            <span className={`text-xs font-medium ${color}`}>
              {label}
              {(status === 'reconnecting' || status === 'error') && reconnectAttempts > 0 && (
                <span className="ml-1 opacity-70">(attempt {reconnectAttempts})</span>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
