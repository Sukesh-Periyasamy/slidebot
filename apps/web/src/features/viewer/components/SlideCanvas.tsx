import { useRef, useEffect, memo } from 'react';
import { Loader2, AlertTriangle, FileX } from 'lucide-react';

import { usePdfRenderer } from '../hooks/usePdfRenderer';
import { useViewerStore } from '../store/viewerStore';

// ─────────────────────────────────────────────────────────────────────────────
// SlideCanvas — renders the current PDF page onto a <canvas>
// ─────────────────────────────────────────────────────────────────────────────

interface SlideCanvasProps {
  /** Called with actual rendered px dimensions so the annotation layer can match */
  onDimensionsChange?: (width: number, height: number) => void;
}

export const SlideCanvas = memo(function SlideCanvas({ onDimensionsChange }: SlideCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentPage = useViewerStore((s) => s.currentPage);
  const isLoading = useViewerStore((s) => s.isLoading);
  const isRendering = useViewerStore((s) => s.isRendering);
  const loadError = useViewerStore((s) => s.loadError);
  const pdfDoc = useViewerStore((s) => s.pdfDoc);

  // Render the current page
  usePdfRenderer({ canvasRef, pageNumber: currentPage });

  // Track canvas dimensions for annotation overlay alignment
  // Use a ref so the observer callback always calls the latest prop
  // without re-creating the ResizeObserver (avoids infinite loops).
  const onDimensionsChangeRef = useRef(onDimensionsChange);
  onDimensionsChangeRef.current = onDimensionsChange;

  useEffect(() => {
    if (!canvasRef.current) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas || !onDimensionsChangeRef.current) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w > 0 && h > 0) {
        onDimensionsChangeRef.current(w, h);
      }
    });

    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-surface-400">
          <Loader2 className="animate-spin" size={32} />
          <p className="text-sm">Loading presentation…</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-red-400">
          <AlertTriangle size={32} />
          <p className="text-sm font-medium">Failed to load PDF</p>
          <p className="text-xs text-surface-500">{loadError}</p>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!pdfDoc) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-surface-600">
          <FileX size={32} />
          <p className="text-sm">No presentation loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      {/* PDF canvas */}
      <canvas
        ref={canvasRef}
        className="block shadow-2xl rounded-sm"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />

      {/* Render-in-progress shimmer overlay */}
      {isRendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-900/20 backdrop-blur-[1px]">
          <Loader2 className="animate-spin text-brand-400" size={20} />
        </div>
      )}
    </div>
  );
});
