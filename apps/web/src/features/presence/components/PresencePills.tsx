import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';

import { usePresence } from '../hooks/usePresence';

export function PresencePills() {
  const { participants, presenter, connectionState } = usePresence();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnimatePresence initial={false}>
        {participants.slice(0, 4).map((participant) => (
          <motion.div
            key={participant.userId}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={`flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-medium backdrop-blur-sm ${
              participant.isIdle ? 'border-surface-800 bg-surface-900/60 text-surface-500' : 'border-surface-700 bg-surface-900/90 text-surface-100'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full border border-white/80 ${participant.isOnline ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: participant.color }}
            />
            <span className="max-w-[120px] truncate">{participant.displayName}</span>
            {participant.isPresenter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-300">
                <Sparkles size={10} />
                Presenter Active
              </span>
            )}
            {participant.isReconnecting && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                <Loader2 size={10} className="animate-spin" />
                Reconnecting
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {participants.length > 4 && (
        <span className="rounded-full border border-surface-800 bg-surface-900/60 px-2 py-1 text-[11px] text-surface-400">
          +{participants.length - 4}
        </span>
      )}

      <span
        className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${
          connectionState === 'connected'
            ? 'bg-emerald-500/10 text-emerald-300'
            : connectionState === 'reconnecting'
              ? 'bg-amber-500/10 text-amber-300'
              : 'bg-surface-800 text-surface-400'
        }`}
      >
        {connectionState}
      </span>

      {presenter && (
        <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-[10px] font-medium text-brand-300">
          Presenter Active
        </span>
      )}
    </div>
  );
}
