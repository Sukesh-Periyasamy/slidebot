import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Share2, Check, Copy, Download, FileText, Database, Video } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useSyncStore } from '@/features/sync/store/syncStore';
import { useAuthStore } from '@/features/auth/store/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// RoomHeader — slim top bar: room name, session ID, share button
// ─────────────────────────────────────────────────────────────────────────────

interface RoomHeaderProps {
  deckName: string;
  onLeave: () => void;
  participantCount: number;
  participantsPanelOpen: boolean;
  onToggleParticipants: () => void;
}

export const RoomHeader = memo(function RoomHeader({
  deckName,
  onLeave,
  participantCount,
  participantsPanelOpen,
  onToggleParticipants,
}: RoomHeaderProps) {
  const session = useSyncStore((s) => s.session);
  const status = useSyncStore((s) => s.connectionStatus);
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const { roomId } = useParams<{ roomId: string }>();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback — select all text in an input
    }
  };

  return (
    <header className="flex h-11 items-center justify-between border-b border-surface-800 bg-surface-900/70 backdrop-blur-sm px-4 flex-shrink-0">
      {/* Left — Logo + Room name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-500 flex-shrink-0">
          <SlideBotMiniIcon />
        </div>
        <h1 className="text-sm font-medium text-surface-200 truncate max-w-[200px]">{deckName}</h1>
        {session?.sessionId && (
          <span className="hidden sm:flex items-center gap-1 rounded-full bg-surface-800 px-2 py-0.5 text-[10px] font-mono text-surface-500">
            #{session.sessionId.slice(-6).toUpperCase()}
          </span>
        )}
        
        {/* Presenter Badge */}
        {session?.presenterName && (
          <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            <span className="text-[10px] font-medium text-brand-300">
              <span className="opacity-75">Presenter:</span> {session.presenterName}
            </span>
          </div>
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1.5">
        
        {/* Export Menu */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-surface-400 hover:bg-surface-800 hover:text-surface-200 transition-all"
            title="Export session"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>
          
          <AnimatePresence>
            {exportOpen && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-surface-700 bg-surface-900 p-1 shadow-xl z-50"
              >
                <Link
                  to={`/room/${roomId}/export`}
                  target="_blank"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium text-surface-200 hover:bg-surface-800 hover:text-white"
                  onClick={() => setExportOpen(false)}
                >
                  <FileText size={14} className="text-surface-400" />
                  PDF / Print
                </Link>
                <button
                  onClick={async () => {
                    setExportOpen(false);
                    const token = useAuthStore.getState().session?.access_token;
                    const url = `${import.meta.env.VITE_API_URL}/rooms/${roomId}/snapshot?token=${token}`;
                    window.open(url, '_blank');
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium text-surface-200 hover:bg-surface-800 hover:text-white"
                >
                  <Database size={14} className="text-surface-400" />
                  Room Snapshot
                </button>
                <button
                  onClick={async () => {
                    setExportOpen(false);
                    const token = useAuthStore.getState().session?.access_token;
                    const url = `${import.meta.env.VITE_API_URL}/rooms/${roomId}/replay?token=${token}`;
                    window.open(url, '_blank');
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-medium text-surface-200 hover:bg-surface-800 hover:text-white"
                >
                  <Video size={14} className="text-surface-400" />
                  Replay Data
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Share button */}
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-surface-400 hover:bg-surface-800 hover:text-surface-200 transition-all"
          title="Copy session link"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.5 }}
                className="flex items-center gap-1 text-emerald-400"
              >
                <Check size={12} />
                Copied!
              </motion.span>
            ) : (
              <motion.span
                key="share"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.5 }}
                className="flex items-center gap-1"
              >
                <Share2 size={12} />
                Share
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Sync Health */}
        <div 
          className={`h-2 w-2 rounded-full mx-1 ${
            status === 'connected' ? 'bg-emerald-500' :
            status === 'reconnecting' || status === 'connecting' ? 'bg-amber-500 animate-pulse' :
            'bg-red-500'
          }`} 
          title={`Status: ${status}`}
        />

        {/* Participants toggle */}
        <button
          onClick={onToggleParticipants}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
            participantsPanelOpen
              ? 'bg-brand-500/15 text-brand-300'
              : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
          }`}
          title="Toggle participants"
        >
          <ParticipantDots count={participantCount} />
          <span>{participantCount}</span>
        </button>

        {/* Leave */}
        <div className="w-px h-4 bg-surface-800 mx-1" />
        <button
          onClick={onLeave}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-surface-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          title="Leave session"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ParticipantDots — mini avatar stack (up to 3)
// ─────────────────────────────────────────────────────────────────────────────

function ParticipantDots({ count }: { count: number }) {
  const membersMap = useSyncStore((s: any) => s.members);
  const members = useMemo(() => Object.values(membersMap).slice(0, 3), [membersMap]);

  return (
    <div className="flex -space-x-1">
      {members.map((m: any) => (
        <div
          key={m.userId}
          className="h-4 w-4 rounded-full border border-surface-900 text-[8px] flex items-center justify-center font-semibold text-white"
          style={{ backgroundColor: m.color }}
          title={m.displayName}
        >
          {m.displayName.charAt(0).toUpperCase()}
        </div>
      ))}
      {count > 3 && (
        <div className="h-4 w-4 rounded-full border border-surface-900 bg-surface-700 text-[8px] flex items-center justify-center text-surface-400">
          +{count - 3}
        </div>
      )}
    </div>
  );
}

function SlideBotMiniIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.9" />
      <rect x="6" y="8" width="8" height="1.5" rx="0.75" fill="#6173F2" />
      <rect x="6" y="11" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.6" />
      <rect x="6" y="14" width="6" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.4" />
    </svg>
  );
}
