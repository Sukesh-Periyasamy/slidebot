import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { useSyncStore } from '../store/syncStore';

// ─────────────────────────────────────────────────────────────────────────────
// PresenterDisconnectedBanner — shown when presenter loses connection
// ─────────────────────────────────────────────────────────────────────────────

export function PresenterDisconnectedBanner() {
  const presenterDisconnected = useSyncStore((s) => s.presenterDisconnected);
  const session = useSyncStore((s) => s.session);

  return (
    <AnimatePresence>
      {presenterDisconnected && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute top-0 left-0 right-0 z-40 pointer-events-none"
        >
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/20 py-2 text-xs font-medium text-amber-400">
            <Loader2 size={12} className="animate-spin" />
            <span>
              <span className="font-semibold">{session?.presenterName ?? 'Presenter'}</span> has
              disconnected — waiting for them to reconnect (30s grace period)…
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SessionEndedOverlay — shown when session is ended by presenter
// ─────────────────────────────────────────────────────────────────────────────

export function SessionEndedOverlay() {
  const session = useSyncStore((s) => s.session);
  const isEnded = session?.status === 'ended';

  return (
    <AnimatePresence>
      {isEnded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-surface-950/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertTriangle size={36} className="text-amber-400" />
            <div>
              <p className="text-lg font-semibold text-surface-100">Session Ended</p>
              <p className="text-sm text-surface-400 mt-1">
                The presenter ended this session. Redirecting to dashboard…
              </p>
            </div>
            <Loader2 size={20} className="animate-spin text-brand-400" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
