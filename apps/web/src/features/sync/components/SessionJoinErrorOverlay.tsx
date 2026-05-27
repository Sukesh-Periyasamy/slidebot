import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { useSyncStore } from '../store/syncStore';

/**
 * SessionJoinErrorOverlay — shown when session:join fails.
 *
 * Displays a user-friendly error message with "Retry" and "Go to Dashboard"
 * action buttons so the user can recover from the failure.
 */
export const SessionJoinErrorOverlay = memo(function SessionJoinErrorOverlay() {
  const connectionStatus = useSyncStore((s) => s.connectionStatus);
  const errorMessage = useSyncStore((s) => s.connectionErrorMessage);
  const session = useSyncStore((s) => s.session);
  const navigate = useNavigate();

  // Only show when in error state with no active session (join failed)
  const isSessionJoinError =
    connectionStatus === 'error' && !session && errorMessage !== null;

  const handleRetry = useCallback(() => {
    // Clear error state so the sync engine can re-attempt
    useSyncStore.getState().setConnectionStatus('idle');
  }, []);

  const handleGoToDashboard = useCallback(() => {
    useSyncStore.getState().setConnectionStatus('idle');
    navigate('/dashboard');
  }, [navigate]);

  return (
    <AnimatePresence>
      {isSessionJoinError && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-surface-950/80 backdrop-blur-sm"
          role="alert"
          aria-live="assertive"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 flex flex-col items-center gap-5"
          >
            {/* Icon */}
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500/10 text-red-400">
              <AlertTriangle size={24} />
            </div>

            {/* Title + subtitle */}
            <div className="text-center">
              <p className="text-base font-semibold text-surface-100">
                Unable to Join Session
              </p>
              <p className="mt-1 text-sm text-surface-400">
                {errorMessage || 'Something went wrong while connecting to the session. Please try again.'}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col w-full gap-3">
              <button
                onClick={handleRetry}
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
                Retry
              </button>

              <button
                onClick={handleGoToDashboard}
                className="
                  w-full flex items-center justify-center gap-2
                  bg-surface-800 hover:bg-surface-700
                  text-surface-200 text-sm font-medium
                  rounded-xl py-3 px-4
                  transition-colors border border-surface-600
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-400
                "
              >
                <Home size={15} />
                Go to Dashboard
              </button>
            </div>

            {/* Reassurance note */}
            <p className="text-xs text-surface-500 text-center">
              This may be a temporary issue. If the problem persists, check your network connection.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
