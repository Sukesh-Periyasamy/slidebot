import React, { memo, useMemo } from 'react';
import { useUxStore } from '../store/uxStore';
import { usePresenceStore } from '@/features/presence/store/presenceStore';

export const HandRaiseQueue: React.FC = memo(() => {
  const handRaises = useUxStore((state) => state.handRaises);
  const participants = usePresenceStore((state) => state.participants);

  const queue = useMemo(() => {
    return Object.values(handRaises).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [handRaises]);

  if (queue.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 flex flex-col gap-2 z-40 pointer-events-none">
      {queue.map((hr) => {
        const user = participants[hr.userId];
        const displayName = user?.displayName || 'Someone';
        return (
          <div
            key={hr.userId}
            className="flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 text-yellow-900 dark:text-yellow-100 px-3 py-1.5 rounded shadow-lg pointer-events-auto text-sm animate-in fade-in slide-in-from-top-2"
          >
            <span>✋</span>
            <span className="font-medium truncate max-w-[120px]">{displayName}</span>
            <span className="text-xs opacity-80">raised hand</span>
          </div>
        );
      })}
    </div>
  );
});

HandRaiseQueue.displayName = 'HandRaiseQueue';
