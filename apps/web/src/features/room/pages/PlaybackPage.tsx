/**
 * PlaybackPage — Offline collaborative session replay viewer.
 *
 * Loads a .slidereplay (JSON) file and plays back:
 * - Slide transitions (timestamp-driven)
 * - Annotation events (per-slide, timestamp-driven)
 * - Scrubbing (click on timeline to jump to any point)
 *
 * INVARIANTS:
 * - Replay is deterministic: given the same file and the same currentTime,
 *   the rendered state is identical.
 * - No websocket connections; fully offline.
 * - Memory is bounded: store is cleared on slide change.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload, Play, Pause, SkipBack, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAnnotationStore } from '@/features/annotation/store/annotationStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ReplayEvent {
  type: 'annotation_create' | 'annotation_update' | 'annotation_delete' | 'slide_change';
  timestamp: number; // absolute ms since session start
  payload: any;
}

interface ReplaySlide {
  slideId: string;
  slideIndex: number;
  events: ReplayEvent[];
  /** Absolute timestamp (ms) when this slide became active */
  startTimestamp: number;
  /** Absolute timestamp (ms) when this slide ended (or session end) */
  endTimestamp: number;
}

interface ReplayFile {
  version: string;
  roomId: string;
  deckId: string;
  totalDuration: number; // ms
  capturedAt: string;
  slides: ReplaySlide[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse and normalize a raw .slidereplay file.
 * If the file has no timestamps, derives them linearly from slide order.
 */
function normalizeReplayFile(raw: any): ReplayFile {
  if (!raw || !Array.isArray(raw.slides)) {
    throw new Error('Invalid replay file: missing slides array');
  }

  const slides: ReplaySlide[] = raw.slides.map((s: any, index: number) => {
    // Normalize events: ensure each has a timestamp
    const events: ReplayEvent[] = (s.events ?? []).map((e: any, ei: number) => ({
      type: e.type ?? 'annotation_create',
      timestamp: typeof e.timestamp === 'number' ? e.timestamp : ei * 100,
      payload: e.payload ?? e,
    }));

    // Sort events by timestamp (ascending)
    events.sort((a, b) => a.timestamp - b.timestamp);

    return {
      slideId: s.slideId ?? `slide-${index}`,
      slideIndex: typeof s.slideIndex === 'number' ? s.slideIndex : index,
      events,
      startTimestamp: typeof s.startTimestamp === 'number' ? s.startTimestamp : index * 5000,
      endTimestamp: typeof s.endTimestamp === 'number' ? s.endTimestamp : (index + 1) * 5000,
    };
  });

  // Sort slides by startTimestamp
  slides.sort((a, b) => a.startTimestamp - b.startTimestamp);

  // Recalculate totalDuration as max endTimestamp
  const totalDuration =
    typeof raw.totalDuration === 'number'
      ? raw.totalDuration
      : slides.length > 0
      ? slides[slides.length - 1]!.endTimestamp
      : 10_000;

  return {
    version: raw.version ?? 'v1',
    roomId: raw.roomId ?? 'unknown',
    deckId: raw.deckId ?? 'unknown',
    totalDuration,
    capturedAt: raw.capturedAt ?? new Date().toISOString(),
    slides,
  };
}

/** Return the active slide for a given absolute time. */
function getActiveSlide(slides: ReplaySlide[], time: number): ReplaySlide | null {
  for (let i = slides.length - 1; i >= 0; i--) {
    if (slides[i]!.startTimestamp <= time) return slides[i]!;
  }
  return slides[0] ?? null;
}

/** Format ms duration as mm:ss */
function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PlaybackPage
// ─────────────────────────────────────────────────────────────────────────────

export function PlaybackPage() {
  const [replayFile, setReplayFile] = useState<ReplayFile | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Track which events have already been dispatched to avoid replaying them
  const dispatchedRef = useRef<Map<string, Set<number>>>(new Map());
  const lastTickRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const annotationStore = useAnnotationStore.getState;

  // ── File upload ─────────────────────────────────────────────────────────────

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        const normalized = normalizeReplayFile(raw);
        setReplayFile(normalized);
        setCurrentTime(0);
        setIsPlaying(false);
        setParseError(null);
        dispatchedRef.current = new Map();
        annotationStore().clearAnnotations();
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid replay file');
      }
    };
    reader.readAsText(file);

    // Reset input so same file can be re-loaded
    e.target.value = '';
  }, [annotationStore]);

  // ── Animation loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying || !replayFile) return;

    lastTickRef.current = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (next >= replayFile.totalDuration) {
          setIsPlaying(false);
          return replayFile.totalDuration;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, replayFile]);

  // ── Event dispatch (timestamp-driven) ─────────────────────────────────────

  useEffect(() => {
    if (!replayFile) return;

    const activeSlide = getActiveSlide(replayFile.slides, currentTime);
    if (!activeSlide) return;

    const store = annotationStore();

    // Switch slide context when active slide changes
    if (store.currentSlideId !== activeSlide.slideId) {
      store.setCurrentSlide(activeSlide.slideId);
      // Clear dispatched tracking for old slides
      dispatchedRef.current = new Map();
    }

    // Dispatch events for the active slide up to currentTime
    const slideKey = activeSlide.slideId;
    if (!dispatchedRef.current.has(slideKey)) {
      dispatchedRef.current.set(slideKey, new Set());
    }
    const dispatched = dispatchedRef.current.get(slideKey)!;

    for (let i = 0; i < activeSlide.events.length; i++) {
      const ev = activeSlide.events[i]!;
      if (dispatched.has(i)) continue;
      if (ev.timestamp > currentTime) break; // events are sorted ascending

      // Dispatch the event to the store
      if (ev.type === 'annotation_create') {
        store.addAnnotation(ev.payload);
      } else if (ev.type === 'annotation_update') {
        store.updateAnnotation(ev.payload.id, ev.payload);
      } else if (ev.type === 'annotation_delete') {
        store.removeAnnotation(ev.payload.id ?? ev.payload);
      }
      dispatched.add(i);
    }
  }, [currentTime, replayFile, annotationStore]);

  // ── Scrubbing ──────────────────────────────────────────────────────────────

  const handleScrub = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!replayFile) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = ratio * replayFile.totalDuration;

      // Full reset and replay from beginning to newTime
      annotationStore().clearAnnotations();
      dispatchedRef.current = new Map();
      setCurrentTime(newTime);
    },
    [replayFile, annotationStore]
  );

  // ── Restart ────────────────────────────────────────────────────────────────

  const handleRestart = useCallback(() => {
    annotationStore().clearAnnotations();
    dispatchedRef.current = new Map();
    setCurrentTime(0);
    setIsPlaying(true);
  }, [annotationStore]);

  // ── Slide navigation ───────────────────────────────────────────────────────

  const activeSlide = replayFile ? getActiveSlide(replayFile.slides, currentTime) : null;

  const jumpToSlideIndex = useCallback(
    (idx: number) => {
      if (!replayFile) return;
      const slide = replayFile.slides[idx];
      if (!slide) return;
      annotationStore().clearAnnotations();
      dispatchedRef.current = new Map();
      setCurrentTime(slide.startTimestamp);
    },
    [replayFile, annotationStore]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Upload screen
  // ─────────────────────────────────────────────────────────────────────────

  if (!replayFile) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 px-6 text-center text-surface-50">
        <div className="max-w-md w-full p-8 bg-surface-900 rounded-xl border border-surface-800 shadow-xl">
          <div className="mx-auto w-12 h-12 bg-brand-500/20 rounded-full flex items-center justify-center mb-4">
            <Upload className="text-brand-400" size={24} />
          </div>
          <h1 className="text-xl font-semibold mb-2">Session Playback</h1>
          <p className="text-sm text-surface-400 mb-6">
            Upload a <code className="text-brand-300">.slidereplay</code> file to view a deterministic
            offline playback of a collaboration session, including slide transitions and annotations.
          </p>
          {parseError && (
            <p className="text-xs text-red-400 mb-4 bg-red-900/20 px-3 py-2 rounded">{parseError}</p>
          )}
          <label className="cursor-pointer bg-brand-600 hover:bg-brand-500 text-white py-2 px-4 rounded-md font-medium transition-colors w-full block">
            Select .slidereplay file
            <input type="file" accept=".slidereplay,.json" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Playback view
  // ─────────────────────────────────────────────────────────────────────────

  const progress = replayFile.totalDuration > 0 ? currentTime / replayFile.totalDuration : 0;
  const currentSlideIndex = activeSlide ? activeSlide.slideIndex : 0;
  const totalSlides = replayFile.slides.length;

  return (
    <div className="flex flex-col h-screen bg-surface-950 text-surface-50 overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-surface-800 bg-surface-900 flex items-center justify-between px-4 shrink-0" role="banner">
        <div>
          <h1 className="font-medium">Session Playback</h1>
          <p className="text-xs text-surface-400">
            Room: {replayFile.roomId} · {totalSlides} slide{totalSlides !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => {
            setReplayFile(null);
            annotationStore().clearAnnotations();
          }}
          className="text-xs bg-surface-800 hover:bg-surface-700 px-3 py-1.5 rounded-md transition-colors"
          aria-label="Load a different replay file"
        >
          Load Different File
        </button>
      </header>

      {/* Viewer Area */}
      <main className="flex-1 relative flex items-center justify-center bg-surface-950 overflow-hidden">
        {/* Slide indicator overlay */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-surface-900/80 backdrop-blur-sm border border-surface-700 text-xs text-surface-300 px-3 py-1 rounded-full" aria-live="polite">
          Slide {currentSlideIndex + 1} / {totalSlides} · {activeSlide?.slideId ?? '—'}
        </div>

        {activeSlide && (
          <PlaybackCanvas slideId={activeSlide.slideId} />
        )}

        {/* Prev / Next slide jump buttons */}
        <button
          aria-label="Previous slide"
          disabled={currentSlideIndex <= 0}
          onClick={() => jumpToSlideIndex(currentSlideIndex - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-800/70 hover:bg-surface-700 text-surface-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          aria-label="Next slide"
          disabled={currentSlideIndex >= totalSlides - 1}
          onClick={() => jumpToSlideIndex(currentSlideIndex + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-800/70 hover:bg-surface-700 text-surface-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={22} />
        </button>
      </main>

      {/* Playback Controls */}
      <footer className="h-24 border-t border-surface-800 bg-surface-900 p-4 shrink-0" aria-label="Playback controls">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {/* Timeline Scrubber — native range input for full a11y and keyboard support */}
          <input
            type="range"
            min={0}
            max={replayFile.totalDuration}
            step={100}
            value={currentTime}
            onChange={(e) => {
              const newTime = Number(e.target.value);
              annotationStore().clearAnnotations();
              dispatchedRef.current = new Map();
              setCurrentTime(newTime);
            }}
            aria-label="Playback timeline"
            className="w-full h-2 rounded-full appearance-none bg-surface-800 cursor-pointer accent-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />

          {/* Time + Buttons */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-surface-400 tabular-nums" aria-label="Current playback time">
              {formatTime(currentTime)} / {formatTime(replayFile.totalDuration)}
            </span>

            <div className="flex items-center gap-4">
              <button
                aria-label="Restart playback"
                onClick={handleRestart}
                className="p-2 text-surface-400 hover:text-white transition-colors"
              >
                <SkipBack size={20} />
              </button>
              <button
                aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
                onClick={() => setIsPlaying((p) => !p)}
                className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-400 flex items-center justify-center text-white transition-colors"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
            </div>

            {/* Slide thumbnails / jump-list */}
            <div className="flex items-center gap-1.5" aria-label="Slide navigator">
              {replayFile.slides.map((slide, idx) => (
                <button
                  key={slide.slideId}
                  aria-label={`Jump to slide ${idx + 1}`}
                  aria-pressed={idx === currentSlideIndex}
                  onClick={() => jumpToSlideIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    idx === currentSlideIndex
                      ? 'bg-brand-400'
                      : 'bg-surface-700 hover:bg-surface-500'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlaybackCanvas — renders annotations from Zustand store for a given slide
// ─────────────────────────────────────────────────────────────────────────────

function PlaybackCanvas({ slideId }: { slideId: string }) {
  const annotations = useAnnotationStore((s) => s.annotations);
  const slideAnnos = Object.values(annotations).filter((a) => a.slideId === slideId);

  return (
    <div
      className="w-[800px] h-[450px] bg-white rounded-lg shadow-2xl relative overflow-hidden"
      aria-label={`Slide canvas for ${slideId}`}
    >
      {slideAnnos.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 select-none pointer-events-none text-sm">
          No annotations at this point
        </div>
      )}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 1000 562"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {slideAnnos.map((anno) => {
          if (anno.data.tool === 'freehand') {
            const pts = anno.data.points as number[];
            if (pts.length < 2) return null;
            const pointStr = pts
              .reduce<string[]>((acc, p, i) => {
                if (i % 2 === 0) acc.push(`${p},`);
                else acc[acc.length - 1] += String(p);
                return acc;
              }, [])
              .join(' ');

            return (
              <polyline
                key={anno.id}
                points={pointStr}
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
