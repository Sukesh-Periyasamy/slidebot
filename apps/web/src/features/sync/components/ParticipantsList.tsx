import { AnimatePresence, motion } from 'framer-motion';
import { Circle, Compass } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { selectMembers, useSyncStore } from '../store/syncStore';
import { useAuthStore } from '@/features/auth/store/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantsList — live presence panel showing all room members
// ─────────────────────────────────────────────────────────────────────────────

interface ParticipantsListProps {
  isOpen: boolean;
}

export function ParticipantsList({ isOpen }: ParticipantsListProps) {
  const user = useAuthStore((s) => s.user);
  const members = useSyncStore(useShallow(selectMembers));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="flex flex-col w-56 border-l border-surface-800 bg-surface-900/60 backdrop-blur-sm"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800">
            <span className="text-xs font-semibold text-surface-300">Participants</span>
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-medium text-brand-300 px-1.5">
              {members.length}
            </span>
          </div>

          {/* Member list */}
          <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <AnimatePresence initial={false}>
              {members.map((member) => (
                <motion.li
                  key={member.userId}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ backgroundColor: member.color }}
                      >
                        {member.displayName.charAt(0).toUpperCase()}
                      </div>
                      {/* Connection dot */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-900 ${
                          member.isConnected ? 'bg-emerald-400' : 'bg-surface-600'
                        }`}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-surface-200 truncate leading-none">
                        {member.displayName}
                        {member.userId === user?.id && (
                          <span className="ml-1 text-[10px] text-surface-500">(you)</span>
                        )}
                      </p>
                      <p className="text-[10px] text-surface-500 mt-0.5 flex items-center gap-1 leading-none">
                        {member.role === 'presenter' ? (
                          <>
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                            <span className="text-brand-400 font-medium">Presenting</span>
                          </>
                        ) : member.isExploring ? (
                          <>
                            <Compass size={9} className="text-amber-400" />
                            <span className="text-amber-400">Exploring</span>
                          </>
                        ) : (
                          <>
                            <Circle size={8} className="text-emerald-400 fill-emerald-400" />
                            <span className="text-emerald-400">Following</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>

            {members.length === 0 && (
              <li className="flex items-center justify-center py-6 text-xs text-surface-600">
                No participants yet
              </li>
            )}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
