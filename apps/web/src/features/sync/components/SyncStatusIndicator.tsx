import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';

import { selectConnectionStatus, useSyncStore } from '../store/syncStore';

// ─────────────────────────────────────────────────────────────────────────────
// SyncStatusIndicator — connection + sync health badge
// ─────────────────────────────────────────────────────────────────────────────

const statusConfig = {
  idle: {
    icon: Wifi,
    color: 'text-surface-600',
    bgColor: 'bg-surface-800',
    dotColor: 'bg-surface-600',
    label: 'Connecting...',
    pulse: false,
  },
  connecting: {
    icon: Loader2,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    dotColor: 'bg-amber-400',
    label: 'Connecting',
    pulse: true,
    spin: true,
  },
  connected: {
    icon: Wifi,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    dotColor: 'bg-emerald-400',
    label: 'Live',
    pulse: true,
  },
  reconnecting: {
    icon: Loader2,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    dotColor: 'bg-amber-400',
    label: 'Reconnecting',
    pulse: false,
    spin: true,
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    dotColor: 'bg-red-400',
    label: 'Connection lost',
    pulse: false,
  },
  disconnected: {
    icon: WifiOff,
    color: 'text-surface-500',
    bgColor: 'bg-surface-800',
    dotColor: 'bg-surface-600',
    label: 'Offline',
    pulse: false,
  },
} as const;

export function SyncStatusIndicator() {
  const connectionStatus = useSyncStore(selectConnectionStatus);
  const reconnectAttempts = useSyncStore((s) => s.reconnectAttempts);

  const config = statusConfig[connectionStatus] ?? statusConfig.idle;
  const { icon: Icon, color, bgColor, dotColor, label, pulse } = config;
  const spin = 'spin' in config ? config.spin : false;

  return (
    <motion.div
      layout
      className={`flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${bgColor} ${color}`}
    >
      {/* Status dot */}
      <span className="relative flex h-1.5 w-1.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${dotColor} ${
            pulse ? 'animate-ping opacity-75' : ''
          }`}
        />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColor}`} />
      </span>

      {/* Icon */}
      <Icon
        size={11}
        className={spin ? 'animate-spin' : ''}
      />

      {/* Label */}
      <span>{label}</span>

      {/* Reconnect attempt count */}
      <AnimatePresence>
        {connectionStatus === 'reconnecting' && reconnectAttempts > 0 && (
          <motion.span
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            className="overflow-hidden text-amber-500"
          >
            ({reconnectAttempts})
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
