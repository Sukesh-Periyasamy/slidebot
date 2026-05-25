import { useState, useEffect, useRef } from 'react';
import { Upload, Play, Pause, SkipBack } from 'lucide-react';

import { useAnnotationStore } from '@/features/annotation/store/annotationStore';

// We will render simple slide images/PDFs directly rather than full RoomPage to ensure offline isolation
export function PlaybackPage() {
  const [replayData, setReplayData] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSlideId, setCurrentSlideId] = useState<string>('');
  
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const eventIndexRef = useRef<number>(0);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        setReplayData(json);
        
        // Calculate total duration based on timestamps if available
        let maxTime = 10000; // default 10s if no timestamps
        setDuration(maxTime);
        setCurrentTime(0);
        eventIndexRef.current = 0;
        
        if (json.slides && json.slides.length > 0) {
          setCurrentSlideId(json.slides[0].slideId);
        }
      } catch (err) {
        alert('Invalid replay file format');
      }
    };
    reader.readAsText(file);
  };

  const clearStore = () => {
    useAnnotationStore.getState().clearAnnotations();
  };

  useEffect(() => {
    if (isPlaying) {
      lastTickRef.current = performance.now();
      timerRef.current = window.requestAnimationFrame(function tick(now) {
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;
        
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return next;
        });
        
        timerRef.current = window.requestAnimationFrame(tick);
      });
    } else {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    }
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
    };
  }, [isPlaying, duration]);

  // Dispatch events based on currentTime
  useEffect(() => {
    if (!replayData || !replayData.slides) return;
    
    // In a real implementation, we would map currentTime to the precise event timestamp.
    // For this robust offline viewer, we simulate event playback linearly.
    const activeSlide = replayData.slides.find((s: any) => s.slideId === currentSlideId);
    if (!activeSlide || !activeSlide.events) return;
    
    const events = activeSlide.events;
    const totalEvents = events.length;
    const progress = currentTime / duration;
    const targetIndex = Math.floor(progress * totalEvents);
    
    if (targetIndex > eventIndexRef.current) {
      // Dispatch new events
      for (let i = eventIndexRef.current; i < targetIndex && i < totalEvents; i++) {
        const ev = events[i];
        if (ev.type === 'annotation_create') {
          useAnnotationStore.getState().addAnnotation(ev.payload);
        } else if (ev.type === 'annotation_update') {
          useAnnotationStore.getState().updateAnnotation(ev.payload.id, ev.payload);
        } else if (ev.type === 'annotation_delete') {
          useAnnotationStore.getState().removeAnnotation(ev.payload.id);
        }
      }
      eventIndexRef.current = targetIndex;
    }
  }, [currentTime, replayData, currentSlideId, duration]);

  if (!replayData) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 px-6 text-center text-surface-50">
        <div className="max-w-md w-full p-8 bg-surface-900 rounded-xl border border-surface-800 shadow-xl">
          <div className="mx-auto w-12 h-12 bg-brand-500/20 rounded-full flex items-center justify-center mb-4">
            <Upload className="text-brand-400" size={24} />
          </div>
          <h1 className="text-xl font-semibold mb-2">Replay Session Playback</h1>
          <p className="text-sm text-surface-400 mb-6">
            Upload a .slidereplay file to view a deterministic offline playback of a collaboration session.
          </p>
          <label className="cursor-pointer bg-brand-600 hover:bg-brand-500 text-white py-2 px-4 rounded-md font-medium transition-colors w-full block">
            Select .slidereplay file
            <input type="file" accept=".slidereplay,.json" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-surface-950 text-surface-50 overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-surface-800 bg-surface-900 flex items-center justify-between px-4 shrink-0">
        <div>
          <h1 className="font-medium">Session Playback</h1>
          <p className="text-xs text-surface-400">Room: {replayData.roomId}</p>
        </div>
        <button 
          onClick={() => { setReplayData(null); clearStore(); }}
          className="text-xs bg-surface-800 hover:bg-surface-700 px-3 py-1.5 rounded-md transition-colors"
        >
          Load Different File
        </button>
      </header>
      
      {/* Viewer Area */}
      <div className="flex-1 relative flex items-center justify-center bg-surface-950 overflow-hidden">
        {/* Render annotations based on the store */}
        <PlaybackCanvas slideId={currentSlideId} />
      </div>

      {/* Playback Controls */}
      <div className="h-20 border-t border-surface-800 bg-surface-900 p-4 shrink-0">
        <div className="max-w-3xl mx-auto flex flex-col gap-2">
          {/* Timeline Scrubber */}
          <div className="relative h-2 bg-surface-800 rounded-full overflow-hidden cursor-pointer">
            <div 
              className="absolute top-0 left-0 bottom-0 bg-brand-500 transition-all duration-75"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
          
          {/* Buttons */}
          <div className="flex items-center justify-center gap-4">
            <button 
              onClick={() => {
                setCurrentTime(0);
                eventIndexRef.current = 0;
                clearStore();
                setIsPlaying(true);
              }}
              className="p-2 text-surface-400 hover:text-white transition-colors"
            >
              <SkipBack size={20} />
            </button>
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 flex items-center justify-center text-white transition-colors"
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimal canvas for rendering annotations from store
function PlaybackCanvas({ slideId }: { slideId: string }) {
  const annotations = useAnnotationStore((s) => s.annotations);
  const slideAnnos = Object.values(annotations).filter((a) => a.slideId === slideId);
  
  return (
    <div className="w-[800px] h-[450px] bg-white rounded-lg shadow-2xl relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center text-surface-300 pointer-events-none">
        Slide Context ({slideId})
      </div>
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="none">
        {slideAnnos.map((anno) => {
          if (anno.data.tool === 'freehand') {
            return (
              <polyline
                key={anno.id}
                points={anno.data.points.reduce((acc: string, p: number, i: number) => {
                  if (i % 2 === 0) return acc + p + ',';
                  return acc + p + ' ';
                }, '')}
                fill="none"
                stroke={anno.color}
                strokeWidth={anno.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={anno.opacity}
              />
            );
          }
          return null;
        })}
      </svg>
    </div>
  );
}
