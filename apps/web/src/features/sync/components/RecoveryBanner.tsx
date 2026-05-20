/**
 * RecoveryBanner — transient toast shown briefly after successful reconnect.
 *
 * Shows for 3.5s after reconnect (when reconnectAttempts > 0 + connected),
 * then auto-dismisses. Confirms to users that session state was fully restored.
 */

import { memo, useState, useEffect, useRef } from 'react';
import { CheckCircle, X } from 'lucide-react';
import { useSyncStore } from '../store/syncStore';

export const RecoveryBanner = memo(function RecoveryBanner() {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const reconnectAttempts = useSyncStore((s) => s.reconnectAttempts);
  const [showBanner, setShowBanner] = useState(false);
  const prevStatusRef = useRef(connectionStatus);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;

    const wasReconnecting = prev === 'reconnecting' || prev === 'connecting';
    const isNowConnected = connectionStatus === 'connected';

    if (wasReconnecting && isNowConnected && reconnectAttempts > 0) {
      setShowBanner(true);
      const timer = setTimeout(() => setShowBanner(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, reconnectAttempts]);

  if (!showBanner) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[150]
        flex items-center gap-3
        bg-surface-800 border border-emerald-500/30
        rounded-xl shadow-lg shadow-emerald-900/20
        px-4 py-3
      "
    >
      <CheckCircle size={16} className="text-emerald-400 shrink-0" />
      <span className="text-sm text-surface-100 font-medium">Session restored — you're back!</span>
      <button
        onClick={() => setShowBanner(false)}
        className="ml-1 text-surface-500 hover:text-surface-300 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
});
