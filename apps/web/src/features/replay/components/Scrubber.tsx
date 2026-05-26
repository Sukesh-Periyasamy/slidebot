import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, MessageSquare, Hand, Image as ImageIcon } from 'lucide-react';

interface ScrubberProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackSpeed: number;
  markers?: Array<{ time: number; type: 'slide_change' | 'comment' | 'hand_raise' }>;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
}

export function Scrubber({ 
  currentTime, 
  duration, 
  isPlaying, 
  playbackSpeed,
  markers = [],
  onPlayPause, 
  onSeek,
  onSpeedChange
}: ScrubberProps) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(Number(e.target.value));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    setHoverPercent(percent);
    setHoverTime(percent * duration);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setHoverPercent(null);
  };

  return (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 bg-surface-900/90 text-surface-50 p-2 md:p-4 rounded-xl shadow-panel backdrop-blur-md pointer-events-auto w-[90vw] md:w-auto max-w-2xl mx-auto">
      <button onClick={() => onSeek(0)} className="p-2 hover:bg-surface-800 rounded-md transition-colors text-surface-400 hover:text-brand-400">
        <SkipBack className="w-5 h-5" />
      </button>
      
      <button onClick={onPlayPause} className="p-2 hover:bg-surface-800 rounded-md transition-colors text-surface-400 hover:text-brand-400">
        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
      </button>

      <div className="text-xs md:text-sm font-mono w-10 md:w-12 text-right text-surface-300">
        {formatTime(currentTime)}
      </div>

      <div 
        role="slider"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        tabIndex={0}
        className="relative flex-1 min-w-[150px] md:w-64 h-8 flex items-center group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          onSeek((x / rect.width) * duration);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            onSeek(Math.min(duration, currentTime + 5000));
          } else if (e.key === 'ArrowLeft') {
            onSeek(Math.max(0, currentTime - 5000));
          }
        }}
      >
        {/* The Track */}
        <div className="absolute left-0 right-0 h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 bottom-0 bg-brand-500 rounded-full"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>

        {/* Markers */}
        {markers.map((marker, i) => {
          const leftPercent = (marker.time / duration) * 100;
          let color = 'bg-surface-400';
          if (marker.type === 'slide_change') color = 'bg-brand-400';
          if (marker.type === 'comment') color = 'bg-blue-400';
          if (marker.type === 'hand_raise') color = 'bg-amber-400';

          return (
            <div 
              key={i}
              className={`absolute top-1/2 -translate-y-1/2 w-1.5 h-3 ${color} rounded-sm -ml-0.5`}
              style={{ left: `${leftPercent}%` }}
              title={marker.type}
            />
          );
        })}

        {/* Hover Thumbnail Preview */}
        {hoverTime !== null && hoverPercent !== null && (
          <div 
            className="absolute bottom-full mb-2 -ml-16 w-32 bg-surface-800 border border-surface-700 rounded-lg shadow-xl p-1 pointer-events-none"
            style={{ left: `${hoverPercent * 100}%` }}
          >
            <div className="w-full aspect-video bg-surface-900 rounded flex items-center justify-center text-surface-500 overflow-hidden relative">
              <ImageIcon size={16} />
              <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[9px] font-mono text-white">
                {formatTime(hoverTime)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-xs md:text-sm font-mono w-10 md:w-12 text-surface-500">
        {formatTime(duration)}
      </div>

      <div className="w-px h-4 bg-surface-700 mx-1 md:mx-2" />

      {/* Speed Controls */}
      <button 
        onClick={() => {
          const speeds = [0.5, 1, 1.5, 2];
          const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
          onSpeedChange(speeds[nextIndex] ?? 1);
        }}
        className="px-2 py-1 text-xs font-semibold bg-surface-800 hover:bg-surface-700 text-surface-200 rounded-md transition-colors w-10 text-center"
      >
        {playbackSpeed}x
      </button>
    </div>
  );
}
