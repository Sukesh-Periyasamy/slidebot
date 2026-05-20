/**
 * ReconnectOverlay — full-page reconnect UI shown during connection loss.
 *
 * States:
 * - reconnecting: Shows spinner + countdown + attempt progress dots
 * - given-up:     Shows manual retry button
 *
 * Design: Minimal dark overlay, blurs behind it so users can still see their
 * presentation state underneath. Pointer-events-none on the backdrop so
 * existing controls remain accessible.
 */

import { memo } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useBackoffReconnect } from '../hooks/useBackoffReconnect';
import { useSyncStore } from '../store/syncStore';

export const ReconnectOverlay = memo(function ReconnectOverlay() {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const { isReconnecting, attempt, maxAttempts, nextRetryInMs, hasGivenUp, manualRetry } =
    useBackoffReconnect();

  // Don't render when connected or idle
  if (connectionStatus === 'connected' || connectionStatus === 'idle') return null;

  const retrySeconds = Math.ceil(nextRetryInMs / 1000);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="
        fixed inset-0 z-[200] flex items-center justify-center
        bg-surface-950/80 backdrop-blur-sm
        pointer-events-none
      "
    >
      <div
        className="
        pointer-events-auto
        bg-surface-900 border border-surface-700
        rounded-2xl shadow-2xl
        p-8 max-w-sm w-full mx-4
        flex flex-col items-center gap-5
      "
      >
        {/* Icon */}
        <div
          className={`
          w-14 h-14 rounded-full flex items-center justify-center
          ${hasGivenUp ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}
        `}
        >
          {hasGivenUp ? (
            <WifiOff size={24} />
          ) : isReconnecting ? (
            <Wifi size={24} className="animate-pulse" />
          ) : (
            <RefreshCw size={24} className="animate-spin" />
          )}
        </div>

        {/* Title + subtitle */}
        <div className="text-center">
          <p className="text-base font-semibold text-surface-100">
            {hasGivenUp ? 'Connection Lost' : 'Reconnecting\u2026'}
          </p>
          <p className="mt-1 text-sm text-surface-400">
            {hasGivenUp
              ? 'Could not reconnect after multiple attempts.'
              : nextRetryInMs > 0
                ? `Retrying in ${retrySeconds}s (attempt ${attempt} of ${maxAttempts})`
                : 'Attempting to reconnect\u2026'}
          </p>
        </div>

        {/* Progress dots */}
        {!hasGivenUp && (
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: maxAttempts }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i < attempt ? 'bg-amber-400' : 'bg-surface-700'
                }`}
              />
            ))}
          </div>
        )}

        {/* Manual retry button */}
        {hasGivenUp && (
          <button
            id="reconnect-manual-retry"
            onClick={manualRetry}
            className="
              w-full flex items-center justify-center gap-2
              bg-brand-600 hover:bg-brand-500
              text-white text-sm font-medium
              rounded-xl py-3 px-4
              transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
            "
          >
            <RefreshCw size={15} />
            Retry Connection
          </button>
        )}

        {/* Reassurance note */}
        <p className="text-xs text-surface-600 text-center">
          {hasGivenUp
            ? 'Your annotations are saved. Retry to rejoin.'
            : "Your session is preserved. You won't lose any progress."}
        </p>
      </div>
    </div>
  );
});
