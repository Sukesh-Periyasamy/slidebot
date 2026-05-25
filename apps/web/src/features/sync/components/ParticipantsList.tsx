import { AnimatePresence, motion } from 'framer-motion';
import { Circle, Compass, Loader2, Sparkles, Mic, MicOff, Star, MoreVertical } from 'lucide-react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { usePresence } from '@/features/presence/hooks/usePresence';
import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantsList — live presence panel showing all room members
// ─────────────────────────────────────────────────────────────────────────────

interface ParticipantsListProps {
  isOpen: boolean;
}

export function ParticipantsList({ isOpen }: ParticipantsListProps) {
  const user = useAuthStore((s) => s.user);
  const { participants } = usePresence();
  const isCurrentUserPresenter = useSyncStore((s) => s.isPresenter);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

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
              {participants.length}
            </span>
          </div>

          {/* Member list */}
          <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <AnimatePresence initial={false}>
              {participants.map((member) => (
                <motion.li
                  key={member.userId}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  onMouseLeave={() => setMenuOpenId(null)}
                >
                  <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-800/50 group relative">
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
                          member.isOnline ? 'bg-emerald-400' : member.isReconnecting ? 'bg-amber-400 animate-pulse' : 'bg-surface-600'
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
                            <Sparkles size={9} className="text-brand-400" />
                            <span className="text-brand-400 font-medium">Presenter Active</span>
                          </>
                        ) : member.isReconnecting ? (
                          <>
                            <Loader2 size={9} className="animate-spin text-amber-400" />
                            <span className="text-amber-400">Reconnecting</span>
                          </>
                        ) : member.isIdle ? (
                          <>
                            <Compass size={9} className="text-surface-500" />
                            <span className="text-surface-500">Idle</span>
                          </>
                        ) : member.isSpeaking ? (
                          <>
                            <Circle size={8} className="text-cyan-400 fill-cyan-400" />
                            <span className="text-cyan-400">Active</span>
                          </>
                        ) : (
                          <>
                            <Compass size={9} className="text-emerald-400" />
                            <span className="text-emerald-400">Online</span>
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-surface-600">
                        Last seen {new Date(member.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {/* Presenter Controls */}
                    {isCurrentUserPresenter && member.userId !== user?.id && (
                      <div className="relative">
                        <button 
                          onClick={() => setMenuOpenId(menuOpenId === member.userId ? null : member.userId)}
                          className="p-1 rounded-md text-surface-500 hover:text-surface-200 hover:bg-surface-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {menuOpenId === member.userId && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-surface-800 border border-surface-700 rounded-md shadow-lg z-50 overflow-hidden py-1">
                            <button className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 flex items-center gap-2">
                              <Star size={12} /> Spotlight
                            </button>
                            <button className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 flex items-center gap-2">
                              <MicOff size={12} /> Mute
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>

            {participants.length === 0 && (
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
