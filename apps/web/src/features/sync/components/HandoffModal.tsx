import { AnimatePresence, motion } from 'framer-motion';
import { X, Users, Crown, Circle } from 'lucide-react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { selectMembers, useSyncStore } from '../store/syncStore';

// ─────────────────────────────────────────────────────────────────────────────
// HandoffModal — select participant to hand off presenter role to
// ─────────────────────────────────────────────────────────────────────────────

interface HandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onHandoff: (userId: string, displayName: string) => void;
}

export function HandoffModal({ isOpen, onClose, onHandoff }: HandoffModalProps) {
  const user = useAuthStore((s) => s.user);
  const members = useSyncStore(useShallow(selectMembers));

  // Only show connected non-self members
  const eligibleMembers = members.filter((m) => m.userId !== user?.id && m.isConnected);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
          >
            <div className="glass-strong rounded-2xl shadow-panel overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/20">
                    <Crown size={14} className="text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-surface-100">Hand Off Presenter</h2>
                    <p className="text-xs text-surface-500 mt-0.5">Instantly transfer control</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-800 hover:text-surface-200 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Participant list */}
              <div className="p-3">
                {eligibleMembers.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <Users size={28} className="text-surface-700" />
                    <p className="text-sm text-surface-500">No other participants</p>
                    <p className="text-xs text-surface-600">
                      Share the session link to invite collaborators
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {eligibleMembers.map((member) => (
                      <li key={member.userId}>
                        <button
                          onClick={() => {
                            onHandoff(member.userId, member.displayName);
                            onClose();
                          }}
                          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-800 transition-colors group text-left"
                        >
                          {/* Avatar */}
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white flex-shrink-0"
                            style={{ backgroundColor: member.color }}
                          >
                            {member.displayName.charAt(0).toUpperCase()}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-surface-200 truncate">
                              {member.displayName}
                            </p>
                            <p className="text-xs text-surface-500 flex items-center gap-1 mt-0.5">
                              <Circle
                                size={6}
                                className={
                                  member.isConnected
                                    ? 'fill-emerald-400 text-emerald-400'
                                    : 'fill-surface-600 text-surface-600'
                                }
                              />
                              {member.isExploring ? 'Exploring' : 'Following'}
                            </p>
                          </div>

                          {/* Handoff arrow */}
                          <span className="text-xs text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                            Hand off →
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Note */}
              <div className="px-5 pb-4 pt-1">
                <p className="text-xs text-surface-600 text-center">
                  Transfer is instant — no interruption to the presentation.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
