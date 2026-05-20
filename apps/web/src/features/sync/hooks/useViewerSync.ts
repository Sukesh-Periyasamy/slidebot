import { useEffect, useCallback } from 'react';

import { useViewerStore } from '@/features/viewer/store/viewerStore';
import {
  selectCurrentSlide,
  selectIsExploring,
  selectPresenterDisconnected,
  useSyncStore,
} from '../store/syncStore';
import type { useSyncEngine } from './useSyncEngine';

// ─────────────────────────────────────────────────────────────────────────────
// useViewerSync — syncs the PDF viewer to presenter's current slide
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Viewer sync behaviour:
 * - When NOT exploring: automatically follow presenter's slide changes
 * - When exploring: ignore presenter updates, maintain own position
 * - Snap back: immediately jump to presenter's slide and exit explore mode
 *
 * The viewer's PDF page number is 1-indexed; session slides are 0-indexed.
 */
export function useViewerSync(engine: ReturnType<typeof useSyncEngine>) {
  const isExploring = useSyncStore(selectIsExploring);
  const presenterCurrentSlide = useSyncStore(selectCurrentSlide);
  const presenterDisconnected = useSyncStore(selectPresenterDisconnected);

  const viewerSetPage = useViewerStore((s) => s.setCurrentPage);
  const viewerCurrentPage = useViewerStore((s) => s.currentPage);

  // ── Auto-follow presenter ─────────────────────────────────────────────────
  useEffect(() => {
    // Skip if in explore mode or if viewer is already on the right slide
    if (isExploring) return;

    const targetPage = presenterCurrentSlide + 1; // 0-indexed → 1-indexed
    if (viewerCurrentPage !== targetPage) {
      viewerSetPage(targetPage);
    }
  }, [presenterCurrentSlide, isExploring, viewerCurrentPage, viewerSetPage]);

  // ── Snap back to presenter ────────────────────────────────────────────────
  const snapToPresenter = useCallback(() => {
    engine.followPresenter();
    // Immediately update local viewer — don't wait for server round-trip
    viewerSetPage(presenterCurrentSlide + 1);
  }, [engine, presenterCurrentSlide, viewerSetPage]);

  return {
    isExploring,
    presenterDisconnected,
    presenterCurrentSlide,
    snapToPresenter,
    enterExploreMode: engine.enterExploreMode,
  };
}
