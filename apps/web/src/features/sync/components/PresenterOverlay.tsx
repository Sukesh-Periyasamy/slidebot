import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Maximize2, Minimize2, FileText, X, LayoutGrid, EyeOff } from 'lucide-react';
import { useSyncStore } from '../store/syncStore';
import { useUxStore } from '@/features/collaboration/store/uxStore';
import { FloatingToolbar } from '@/shared/components/FloatingToolbar';
import { Button } from '@/shared/components/Button';
import { PresenterNotes } from '@/features/viewer/components/PresenterNotes';
import { SlideJumpNavigator } from '@/features/viewer/components/SlideJumpNavigator';
import { useFullscreen } from '@/features/viewer/hooks/useFullscreen';

export function PresenterOverlay() {
  const isPresenter = useSyncStore((s) => s.isPresenter);
  const distractionFreeMode = useUxStore((s) => s.distractionFreeMode);
  const toggleDistractionFreeMode = useUxStore((s) => s.toggleDistractionFreeMode);
  const [elapsed, setElapsed] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [showNavigator, setShowNavigator] = useState(false);
  const { isFullscreen, toggleFullscreen } = useFullscreen();

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
      <FloatingToolbar className="absolute top-4 left-1/2 -translate-x-1/2 z-50 !px-4 !py-2 transition-opacity duration-300">
        <div className="flex items-center gap-2 text-brand-300 font-medium text-sm">
          <Clock size={16} />
          <span className="w-12 text-center font-mono">{formatTime(elapsed)}</span>
        </div>
        
        <div className="w-px h-4 bg-surface-700 mx-2" />
        
        <button 
          onClick={() => setShowNavigator(true)}
          className="flex items-center gap-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1 text-surface-400 hover:text-surface-200"
          title="Slide Jump Navigator"
        >
          <LayoutGrid size={16} aria-hidden="true" />
          Jump
        </button>

        <button 
          onClick={() => setShowNotes(true)}
          className={`flex items-center gap-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1 ${showNotes ? 'text-brand-400' : 'text-surface-400 hover:text-surface-200'}`}
          title="Presenter Notes"
        >
          <FileText size={16} aria-hidden="true" />
          Notes
        </button>

        <button 
          onClick={toggleDistractionFreeMode}
          className={`flex items-center gap-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1 ${distractionFreeMode ? 'text-brand-400' : 'text-surface-400 hover:text-surface-200'}`}
          title="Toggle Distraction Free Mode"
        >
          <EyeOff size={16} aria-hidden="true" />
          Focus
        </button>

        <div className="w-px h-4 bg-surface-700 mx-2" />

        <button 
          onClick={toggleFullscreen}
          className="flex items-center gap-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1 text-surface-400 hover:text-surface-200"
          title="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </FloatingToolbar>

      <SlideJumpNavigator open={showNavigator} onOpenChange={setShowNavigator} />
      <PresenterNotes open={showNotes} onOpenChange={setShowNotes} />
    </>
  );
}
