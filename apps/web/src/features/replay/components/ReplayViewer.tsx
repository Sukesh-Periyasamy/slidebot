import React, { useState, useEffect } from 'react';
import { MessageSquare, BarChart2 } from 'lucide-react';
import { Scrubber } from './Scrubber';
import { replayManager } from '@/features/collaboration/lib/replayManager';

interface ReplayViewerProps {
  roomId: string;
  duration?: number;
  onClose?: () => void;
}

export function ReplayViewer({ roomId, duration = 300000, onClose }: ReplayViewerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Fake markers for demonstration
  const markers = [
    { time: 30000, type: 'slide_change' as const },
    { time: 85000, type: 'comment' as const },
    { time: 120000, type: 'slide_change' as const },
    { time: 200000, type: 'hand_raise' as const }
  ];

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      if (isPlaying) {
        const delta = time - lastTime;
        setCurrentTime((prev) => {
          const next = prev + (delta * playbackSpeed);
          if (next >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return next;
        });
      }
      lastTime = time;
      animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(loop);
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, duration, playbackSpeed]);

  // When currentTime changes, we would ideally sync the viewerStore / replayManager
  // to deterministic state. For the sprint stub, we just simulate the UI.
  useEffect(() => {
    // e.g. replayManager.restoreToTime(currentTime);
  }, [currentTime]);

  const activeComments = markers.filter(m => m.type === 'comment' && Math.abs(m.time - currentTime) < 5000);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none">
      
      {/* Replay Analytics Overlay (Mock) */}
      <div className="absolute top-4 left-4 p-4 bg-surface-900/90 backdrop-blur shadow-panel rounded-xl border border-surface-800 flex items-center gap-4 pointer-events-auto">
        <div className="p-2 bg-brand-500/20 rounded-lg text-brand-400">
          <BarChart2 size={24} />
        </div>
        <div>
          <div className="text-xs text-surface-400 font-medium">Viewer Engagement</div>
          <div className="text-xl font-bold text-surface-50">
            {Math.min(100, Math.max(10, Math.floor(Math.sin(currentTime / 10000) * 40 + 60)))}%
          </div>
        </div>
      </div>

      {/* Replay Comments Overlay */}
      {activeComments.length > 0 && (
        <div className="absolute right-4 bottom-24 w-72 space-y-2 pointer-events-auto">
          {activeComments.map((comment, i) => (
            <div key={i} className="bg-surface-900/95 backdrop-blur border border-surface-700 p-3 rounded-lg shadow-lg animate-in slide-in-from-right fade-in">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare size={14} className="text-brand-400" />
                <span className="text-xs font-semibold text-surface-200">Replay Comment</span>
                <span className="text-[10px] text-surface-500 ml-auto font-mono">
                  {Math.floor(comment.time / 1000)}s
                </span>
              </div>
              <p className="text-sm text-surface-300">
                This is a mock recorded comment tied to this point in the timeline.
              </p>
            </div>
          ))}
        </div>
      )}

      <Scrubber
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        markers={markers}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onSeek={(time) => setCurrentTime(time)}
        onSpeedChange={setPlaybackSpeed}
      />
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 pointer-events-auto bg-gray-900/90 text-white px-4 py-2 rounded shadow hover:bg-gray-800"
        >
          Exit Replay
        </button>
      )}
    </div>
  );
}
