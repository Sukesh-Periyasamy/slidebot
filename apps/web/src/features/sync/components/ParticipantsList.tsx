import { AnimatePresence, motion } from 'framer-motion';
import { Circle, Compass, Loader2, Sparkles, Mic, MicOff, Star, MoreVertical, Hand } from 'lucide-react';

import { useAuthStore } from '@/features/auth/store/authStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { useUxStore } from '@/features/collaboration/store/uxStore';
import { usePresence } from '@/features/presence/hooks/usePresence';
import { useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AdaptiveSidebar } from '@/shared/components/AdaptiveSidebar';

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantsList — live presence panel showing all room members
// ─────────────────────────────────────────────────────────────────────────────

interface ParticipantsListProps {
  isOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ParticipantsList({ isOpen, onOpenChange }: ParticipantsListProps) {
  const user = useAuthStore((s) => s.user);
  const { participants } = usePresence();
  const isCurrentUserPresenter = useSyncStore((s) => s.isPresenter);
  const raisedHands = useSyncStore((s) => s.raisedHands);
  const spotlightUserId = useUxStore((s) => s.spotlightUserId);
  const setSpotlightUserId = useUxStore((s) => s.setSpotlightUserId);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const parentRef = useRef<HTMLUListElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: participants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // approximate height of a participant row
    overscan: 5,
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <AdaptiveSidebar
          open={isOpen}
          onOpenChange={onOpenChange as (open: boolean) => void}
          side="right"
          className="flex flex-col bg-surface-900/60 backdrop-blur-sm"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-800">
            <h2 id="participants-title" className="text-xs font-semibold text-surface-300">Participants</h2>
            <span 
              className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500/20 text-[10px] font-medium text-brand-300 px-1.5"
              aria-label={`${participants.length} participants`}
            >
              {participants.length}
            </span>
          </div>

          {/* Member list */}
          <ul ref={parentRef} className="flex-1 overflow-y-auto p-2" aria-labelledby="participants-title">
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              <AnimatePresence initial={false}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const member = participants[virtualRow.index];
                  if (!member) return null;
                  return (
                  <motion.li
                    key={member.userId}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onMouseLeave={() => setMenuOpenId(null)}
                  >
                    <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-surface-800/50 group relative mx-1">
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
                          aria-hidden="true"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-surface-200 truncate leading-none" aria-label={member.displayName}>
                          {member.displayName}
                          {member.userId === user?.id && (
                            <span className="ml-1 text-[10px] text-surface-500" aria-hidden="true">(you)</span>
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

                      {/* Raised Hand Indicator */}
                      {raisedHands.includes(member.userId) && (
                        <div className="flex-shrink-0 text-brand-400" title="Hand Raised">
                          <Hand size={14} />
                        </div>
                      )}
                      
                      {/* Spotlight Indicator */}
                      {spotlightUserId === member.userId && (
                        <div className="flex-shrink-0 text-amber-400" title="Spotlighted">
                          <Star size={14} />
                        </div>
                      )}

                      {/* Presenter Controls */}
                      {isCurrentUserPresenter && member.userId !== user?.id && (
                        <div className="relative">
                          <button 
                            onClick={() => setMenuOpenId(menuOpenId === member.userId ? null : member.userId)}
                            className="p-1 rounded-md text-surface-500 hover:text-surface-200 hover:bg-surface-700 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-500 transition-opacity"
                            aria-haspopup="true"
                            aria-expanded={menuOpenId === member.userId}
                            aria-label={`Options for ${member.displayName}`}
                          >
                            <MoreVertical size={14} aria-hidden="true" />
                          </button>
                          {menuOpenId === member.userId && (
                            <div 
                              className="absolute right-0 top-full mt-1 w-32 bg-surface-800 border border-surface-700 rounded-md shadow-lg z-50 overflow-hidden py-1"
                              role="menu"
                              aria-label={`Options for ${member.displayName}`}
                            >
                              <button 
                                onClick={() => {
                                  setSpotlightUserId(spotlightUserId === member.userId ? null : member.userId);
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 flex items-center gap-2 focus-visible:bg-surface-700 focus-visible:outline-none" 
                                role="menuitem"
                              >
                                <Star size={12} aria-hidden="true" /> {spotlightUserId === member.userId ? 'Remove Spotlight' : 'Spotlight'}
                              </button>
                              <button className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 flex items-center gap-2 focus-visible:bg-surface-700 focus-visible:outline-none" role="menuitem">
                                <MicOff size={12} aria-hidden="true" /> Mute
                              </button>
                              {raisedHands.includes(member.userId) && (
                                <button 
                                  onClick={() => {
                                    import('@/features/collaboration/lib/sessionManager').then((m) => m.sessionManager.lowerHand(member.userId));
                                    setMenuOpenId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-700 flex items-center gap-2 focus-visible:bg-surface-700 focus-visible:outline-none" 
                                  role="menuitem"
                                >
                                  <Hand size={12} aria-hidden="true" /> Lower Hand
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.li>
                  );
                })}
              </AnimatePresence>
            </div>

            {participants.length === 0 && (
              <li className="flex items-center justify-center py-6 text-xs text-surface-600" aria-live="polite">
                No participants yet
              </li>
            )}
          </ul>
        </AdaptiveSidebar>
      )}
    </AnimatePresence>
  );
}
