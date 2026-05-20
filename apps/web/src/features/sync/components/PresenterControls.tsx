import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Pencil,
  Highlighter,
  ArrowUpRight,
  Type,
  Eraser,
  MousePointer2,
  Zap,
  Users,
  LogOut,
} from 'lucide-react';

import { useViewerStore, type ZoomPreset } from '@/features/viewer/store/viewerStore';
import { useAnnotationStore, selectToolConfig } from '@/features/annotation/store/annotationStore';
import type { AnnotationTool } from '@/features/annotation/types/annotation.types';
import { ANNOTATION_COLORS } from '@/features/annotation/types/annotation.types';
import { selectIsPresenter, useSyncStore } from '../store/syncStore';
import type { useExplorationMode } from '../hooks/useExplorationMode';

// ─────────────────────────────────────────────────────────────────────────────
// PresenterControls — unified control bar at the bottom of the room
// ─────────────────────────────────────────────────────────────────────────────

interface PresenterControlsProps {
  exploration: ReturnType<typeof useExplorationMode>;
  onHandoffClick: () => void;
  onEndSession: () => void;
}

const ZOOM_PRESETS: { label: string; value: ZoomPreset }[] = [
  { label: 'Fit', value: 'fit' },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1 },
  { label: '150%', value: 1.5 },
];

const ANNOTATION_TOOLS: {
  tool: AnnotationTool;
  Icon: React.FC<{ size?: number }>;
  label: string;
}[] = [
  { tool: 'select', Icon: MousePointer2, label: 'Select' },
  { tool: 'freehand', Icon: Pencil, label: 'Draw' },
  { tool: 'highlight', Icon: Highlighter, label: 'Highlight' },
  { tool: 'arrow', Icon: ArrowUpRight, label: 'Arrow' },
  { tool: 'text', Icon: Type, label: 'Text' },
  { tool: 'laser', Icon: Zap, label: 'Laser' },
  { tool: 'eraser', Icon: Eraser, label: 'Erase' },
];

export function PresenterControls({
  exploration,
  onHandoffClick,
  onEndSession,
}: PresenterControlsProps) {
  const {
    isPresenter,
    isExploring,
    viewerPage,
    totalPages,
    presenterName,
    presenterSlide,
    navigatePrev,
    navigateNext,
    presenterPrev,
    presenterNext,
    snapToPresenter,
  } = exploration;

  const zoom = useViewerStore((s) => s.zoom);
  const setZoom = useViewerStore((s) => s.setZoom);
  const isFullscreen = useViewerStore((s) => s.isFullscreen);

  const toolConfig = useAnnotationStore(selectToolConfig);
  const setTool = useAnnotationStore((s) => s.setTool);
  const setColor = useAnnotationStore((s) => s.setColor);

  // Use presenter or viewer navigation depending on role
  const handlePrev = isPresenter ? presenterPrev : navigatePrev;
  const handleNext = isPresenter ? presenterNext : navigateNext;

  return (
    <div className="relative flex items-center justify-between px-4 py-2 border-t border-surface-800 bg-surface-900/80 backdrop-blur-sm">
      {/* ── Left: Annotation toolbar ───────────────────────────────────── */}
      <div className="flex items-center gap-1">
        {ANNOTATION_TOOLS.map(({ tool, Icon, label }) => (
          <button
            key={tool}
            onClick={() => setTool(tool)}
            title={label}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              toolConfig.tool === tool
                ? 'bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40'
                : 'text-surface-500 hover:bg-surface-800 hover:text-surface-200'
            }`}
          >
            <Icon size={15} />
          </button>
        ))}

        {/* Color picker strip */}
        <div className="ml-2 flex items-center gap-1">
          {ANNOTATION_COLORS.slice(0, 5).map((color) => (
            <button
              key={color}
              onClick={() => setColor(color)}
              title={color}
              className={`h-4 w-4 rounded-full border-2 transition-transform hover:scale-110 ${
                toolConfig.color === color ? 'border-white scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* ── Center: Slide navigation ───────────────────────────────────── */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        {/* Explore mode badge */}
        <AnimatePresence>
          {isExploring && !isPresenter && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-2 py-1 text-xs font-medium text-amber-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Exploring
            </motion.div>
          )}
          {!isExploring && !isPresenter && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-1 text-xs font-medium text-emerald-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Following {presenterName}
            </motion.div>
          )}
          {isPresenter && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 rounded-full bg-brand-500/15 border border-brand-500/25 px-2 py-1 text-xs font-medium text-brand-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Presenting
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prev */}
        <button
          onClick={handlePrev}
          disabled={viewerPage <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-800 hover:text-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Previous slide (←)"
        >
          <ChevronLeft size={18} />
        </button>

        {/* Page counter */}
        <div className="flex items-center gap-1 text-sm font-medium">
          <PageInput
            currentPage={viewerPage}
            totalPages={totalPages}
            onNavigate={
              isPresenter
                ? (p) => exploration.presenterGoto(p - 1)
                : (p) => exploration.navigateToPage(p)
            }
          />
          <span className="text-surface-600">/</span>
          <span className="text-surface-500 text-sm">{totalPages}</span>
        </div>

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={viewerPage >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-surface-400 hover:bg-surface-800 hover:text-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          title="Next slide (→)"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Right: Zoom + Presenter actions ───────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* Zoom selector */}
        <div className="flex items-center gap-0.5 rounded-lg border border-surface-800 p-0.5">
          {ZOOM_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => setZoom(value)}
              className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                zoom === value
                  ? 'bg-surface-700 text-surface-100'
                  : 'text-surface-500 hover:text-surface-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Presenter-only actions */}
        {isPresenter && (
          <>
            <div className="w-px h-5 bg-surface-800" />
            <button
              onClick={onHandoffClick}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-surface-400 hover:bg-surface-800 hover:text-surface-100 transition-all"
              title="Hand off presenter role"
            >
              <Users size={13} />
              Hand Off
            </button>
            <button
              onClick={onEndSession}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all"
              title="End session"
            >
              <LogOut size={13} />
              End
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PageInput — editable slide number input
// ─────────────────────────────────────────────────────────────────────────────

function PageInput({
  currentPage,
  totalPages,
  onNavigate,
}: {
  currentPage: number;
  totalPages: number;
  onNavigate: (page: number) => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      if (!isNaN(val)) onNavigate(Math.max(1, Math.min(val, totalPages)));
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="number"
      defaultValue={currentPage}
      key={currentPage}
      min={1}
      max={totalPages}
      onKeyDown={handleKeyDown}
      onFocus={(e) => e.target.select()}
      className="w-10 bg-transparent text-center text-sm font-semibold text-surface-100 outline-none focus:ring-1 focus:ring-brand-500/40 rounded px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}
