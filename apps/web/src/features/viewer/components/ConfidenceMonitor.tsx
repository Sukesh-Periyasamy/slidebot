import React, { useState, useEffect } from 'react';
import { useViewerStore } from '@/features/viewer/store/viewerStore';
import { useSyncStore } from '@/features/sync/store/syncStore';
import { useUxStore } from '@/features/collaboration/store/uxStore';
import { Clock } from 'lucide-react';

export function ConfidenceMonitor() {
  const currentPage = useViewerStore((s) => s.currentPage);
  const totalPages = useViewerStore((s) => s.pdfDoc?.numPages ?? 0);
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const members = useSyncStore((s) => s.members);
  const confidenceMonitorVisible = useUxStore((s) => s.confidenceMonitorVisible);
  
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    if (!isPresenter) return;
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, [isPresenter]);

  if (!isPresenter || !confidenceMonitorVisible) return null;

  return (
    <div className="absolute top-4 right-4 pointer-events-none z-50 flex gap-4 items-start">
      <div className="bg-surface-900/90 backdrop-blur-md rounded-xl p-4 shadow-xl border border-surface-700 flex flex-col gap-2 min-w-[200px]">
        <div className="flex items-center justify-between text-surface-400 text-xs font-mono uppercase">
          <span>Current Time</span>
          <Clock size={14} />
        </div>
        <div className="text-3xl font-bold text-white tabular-nums">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        
        <div className="w-full h-px bg-surface-800 my-2" />
        
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-surface-400">Audience</span>
          <span className="text-brand-300">{Object.keys(members).length} connected</span>
        </div>
        <div className="flex justify-between items-center text-sm font-medium">
          <span className="text-surface-400">Progress</span>
          <span className="text-surface-100">{currentPage} / {totalPages}</span>
        </div>
      </div>
    </div>
  );
}
