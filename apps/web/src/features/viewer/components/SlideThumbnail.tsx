/**
 * SlideThumbnail — single thumbnail card in the sidebar.
 *
 * Responsibilities:
 * - Lazy-render the PDF page via IntersectionObserver
 * - Show active (viewer) + presenter indicators
 * - Exploration mode indicator (amber ring)
 * - Click triggers navigation (presenter) or explore mode (viewer)
 * - Zero re-renders on unrelated slide changes (memo + stable props)
 */

import { memo, useRef, useState, useEffect, useCallback } from 'react';
import { Crown, Eye, Bookmark } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { useThumbnailRenderer } from '../hooks/useThumbnailRenderer';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface SlideThumbnailProps {
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number; // 1-indexed
  /** Is this the slide the viewer is currently on? */
  isViewerActive: boolean;
  /** Is this the slide the presenter is currently on? */
  isPresenterSlide: boolean;
  /** Is the viewer in exploration mode (not following presenter)? */
  isExploring: boolean;
  /** Is the current user the presenter? */
  isPresenter: boolean;
  isBookmarked?: boolean;
  onBookmark?: () => void;
  onClick: (pageNumber: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const SlideThumbnail = memo(function SlideThumbnail({
  pdfDoc,
  pageNumber,
  isViewerActive,
  isPresenterSlide,
  isExploring,
  isPresenter,
  isBookmarked,
  onBookmark,
  onClick,
}: SlideThumbnailProps) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // ── Intersection Observer (lazy rendering) ──────────────────────────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsVisible(true);
        // Don't reset to false — keep rendered once visible
      },
      { threshold: 0.1, rootMargin: '200px' } // 200px lookahead for smooth scroll
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { canvasRef, isRendered } = useThumbnailRenderer({ pdfDoc, pageNumber, isVisible });

  const handleClick = useCallback(() => {
    onClick(pageNumber);
  }, [onClick, pageNumber]);

  const handleBookmarkClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onBookmark?.();
  }, [onBookmark]);

  // ── Visual state ────────────────────────────────────────────────────────

  // Viewer ring: brand (following) or amber (exploring)
  const viewerRingClass = isViewerActive
    ? isExploring && !isPresenter
      ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-surface-900'
      : 'ring-2 ring-brand-500 ring-offset-1 ring-offset-surface-900'
    : '';

  // Presenter glow when different from viewer position
  const presenterGlowClass = isPresenterSlide && !isViewerActive ? 'ring-1 ring-brand-500/40' : '';

  return (
    <button
      ref={rootRef}
      onClick={handleClick}
      className={`
        group relative w-full rounded-lg overflow-hidden transition-all duration-150
        bg-surface-800 hover:bg-surface-750
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
        ${viewerRingClass} ${presenterGlowClass}
        ${isViewerActive ? 'shadow-md' : 'opacity-70 hover:opacity-100'}
      `}
      aria-label={`Slide ${pageNumber}${isPresenterSlide ? ' (presenter is here)' : ''}`}
      aria-pressed={isViewerActive}
    >
      {/* Aspect ratio container — 16:9 */}
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Skeleton placeholder — shown before render */}
          {!isRendered && <div className="absolute inset-0 bg-surface-800 animate-pulse" />}

          {/* PDF canvas */}
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
              isRendered ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Active viewer overlay */}
          {isViewerActive && (
            <div
              className={`
              absolute inset-0 pointer-events-none
              ${
                isExploring && !isPresenter
                  ? 'bg-amber-400/5 border border-amber-400/20'
                  : 'bg-brand-500/5 border border-brand-500/20'
              }
              rounded-lg
            `}
            />
          )}

          {/* Presenter indicator badge */}
          {isPresenterSlide && (
            <div
              className={`
              absolute top-1.5 right-1.5
              flex items-center gap-0.5 rounded-full px-1.5 py-0.5
              text-[9px] font-semibold leading-none
              ${
                isViewerActive
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-900/80 text-brand-400 border border-brand-500/30'
              }
            `}
            >
              <Crown size={7} />
            </div>
          )}

          {/* Exploring indicator badge — shown when viewer is here but not following presenter */}
          {isViewerActive && isExploring && !isPresenter && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 bg-amber-500 text-[9px] font-semibold text-white leading-none">
              <Eye size={7} />
            </div>
          )}

          {/* Bookmark Button */}
          <button
            onClick={handleBookmarkClick}
            className={`absolute bottom-1.5 right-1.5 p-1 rounded transition-opacity ${
              isBookmarked 
                ? 'opacity-100 text-brand-400 bg-surface-900/80' 
                : 'opacity-0 group-hover:opacity-100 text-surface-400 hover:text-brand-300 hover:bg-surface-900/80'
            }`}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            <Bookmark size={12} className={isBookmarked ? 'fill-brand-400' : ''} />
          </button>
        </div>
      </div>

      {/* Slide number label */}
      <div
        className={`
        px-2 py-1 text-center text-[10px] font-medium leading-none
        ${
          isViewerActive
            ? isExploring && !isPresenter
              ? 'text-amber-300'
              : 'text-brand-300'
            : 'text-surface-500 group-hover:text-surface-300'
        }
      `}
      >
        {pageNumber}
      </div>
    </button>
  );
});
