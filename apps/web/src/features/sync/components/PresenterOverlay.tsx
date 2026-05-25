import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Maximize2, FileText, X } from 'lucide-react';
import { useSyncStore } from '../store/syncStore';
import { Button } from '@/shared/components/Button';

export function PresenterOverlay() {
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const [elapsed, setElapsed] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    if (!isPresenter) return;
    const interval = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPresenter]);

  if (!isPresenter) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-surface-900/90 backdrop-blur-md border border-surface-700/50 rounded-full px-4 py-2 shadow-panel">
        <div className="flex items-center gap-2 text-brand-300 font-medium text-sm">
          <Clock size={16} />
          <span className="w-12 text-center font-mono">{formatTime(elapsed)}</span>
        </div>
        <div className="w-px h-4 bg-surface-700" />
        <button 
          onClick={() => setShowNotes(!showNotes)}
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${showNotes ? 'text-brand-400' : 'text-surface-400 hover:text-surface-200'}`}
        >
          <FileText size={16} />
          Notes
        </button>
      </div>

      <AnimatePresence>
        {showNotes && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute top-16 right-4 z-40 w-80 bg-surface-900/95 backdrop-blur-md border border-surface-700 rounded-xl shadow-panel overflow-hidden flex flex-col max-h-[60vh]"
          >
            <div className="flex items-center justify-between p-3 border-b border-surface-800 bg-surface-950/50">
              <h3 className="text-sm font-medium text-surface-200 flex items-center gap-2">
                <FileText size={14} /> Speaker Notes
              </h3>
              <button onClick={() => setShowNotes(false)} className="text-surface-400 hover:text-surface-200">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto text-sm text-surface-300 leading-relaxed">
              <p className="italic text-surface-500 text-xs mb-4">Notes are currently extracted from PDF if available. Otherwise, type your manual notes here.</p>
              <textarea 
                className="w-full h-48 bg-transparent text-surface-200 resize-none outline-none focus:ring-1 focus:ring-brand-500 rounded p-2 border border-surface-800 focus:border-brand-500"
                placeholder="Add speaker notes for this slide..."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
