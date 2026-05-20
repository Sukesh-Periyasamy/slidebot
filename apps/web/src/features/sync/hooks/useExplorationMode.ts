import { useCallback } from 'react';

import { useViewerStore } from '@/features/viewer/store/viewerStore';
import {
  selectCurrentSlide,
  selectIsExploring,
  selectPresenterDisconnected,
  selectSession,
  useSyncStore,
} from '../store/syncStore';
import type { useSyncEngine } from './useSyncEngine';

// ─────────────────────────────────────────────────────────────────────────────
// useExplorationMode — independent viewer navigation with presenter awareness
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exploration mode state machine:
 *
 *  FOLLOWING ──[independent nav]──→ EXPLORING
 *  EXPLORING ──[snap back]─────────→ FOLLOWING
 *  EXPLORING ──[catches up to presenter]──→ FOLLOWING
 *
 * Auto-enter: Any time a viewer presses prev/next while in FOLLOWING mode,
 * they automatically enter EXPLORING without an explicit click.
 * This is the most frictionless UX per the product spec.
 */
export function useExplorationMode(engine: ReturnType<typeof useSyncEngine>) {
  const isExploring = useSyncStore(selectIsExploring);
  const presenterSlide = useSyncStore(selectCurrentSlide);  // 0-indexed
  const presenterDisconnected = useSyncStore(selectPresenterDisconnected);
  const session = useSyncStore(selectSession);
  const isPresenter = useSyncStore((s) => s.isPresenter);

  const viewerPage = useViewerStore((s) => s.currentPage);      // 1-indexed
  const totalPages = useViewerStore((s) => s.totalPages);
  const viewerSetPage = useViewerStore((s) => s.setCurrentPage);

  // ── Local navigation (auto-enters explore mode) ───────────────────────────

  const navigatePrev = useCallback(() => {
    if (viewerPage <= 1) return;

    // Auto-enter explore mode on independent navigation (viewers only)
    if (!isPresenter && !isExploring) {
      engine.enterExploreMode();
    }

    viewerSetPage(viewerPage - 1);
  }, [viewerPage, isPresenter, isExploring, engine, viewerSetPage]);

  const navigateNext = useCallback(() => {
    if (viewerPage >= totalPages) return;

    if (!isPresenter && !isExploring) {
      engine.enterExploreMode();
    }

    viewerSetPage(viewerPage + 1);
  }, [viewerPage, totalPages, isPresenter, isExploring, engine, viewerSetPage]);

  const navigateToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > totalPages) return;

      if (!isPresenter && !isExploring && page !== presenterSlide + 1) {
        engine.enterExploreMode();
      }

      viewerSetPage(page);
    },
    [totalPages, isPresenter, isExploring, presenterSlide, engine, viewerSetPage]
  );

  // ── Snap back to presenter ────────────────────────────────────────────────

  const snapToPresenter = useCallback(() => {
    engine.followPresenter();
    // Immediately sync local viewer without waiting for server round-trip
    viewerSetPage(presenterSlide + 1);
  }, [engine, presenterSlide, viewerSetPage]);

  // ── Presenter-side navigation (authoritative) ─────────────────────────────

  const presenterGoto = useCallback(
    (slideIndex: number) => {
      // 0-indexed → server
      engine.gotoSlide(slideIndex);
      // Optimistic update
      viewerSetPage(slideIndex + 1);
    },
    [engine, viewerSetPage]
  );

  const presenterNext = useCallback(() => {
    const nextIndex = viewerPage; // viewerPage is 1-indexed, nextIndex 0-indexed = viewerPage
    if (nextIndex >= totalPages) return;
    presenterGoto(nextIndex);
  }, [viewerPage, totalPages, presenterGoto]);

  const presenterPrev = useCallback(() => {
    const prevIndex = viewerPage - 2; // viewerPage - 1 - 1
    if (prevIndex < 0) return;
    presenterGoto(prevIndex);
  }, [viewerPage, presenterGoto]);

  // ── Sync state analysis ───────────────────────────────────────────────────

  const localSlide = viewerPage - 1;   // 0-indexed for comparison
  const slideDelta = localSlide - presenterSlide;
  const isOutOfSync = isExploring && slideDelta !== 0;
  const isBehindPresenter = slideDelta < 0;
  const isAheadOfPresenter = slideDelta > 0;
  const slidesBehind = Math.abs(slideDelta);

  return {
    // State
    isExploring,
    isPresenter,
    presenterDisconnected,
    isOutOfSync,
    isBehindPresenter,
    isAheadOfPresenter,
    slidesBehind,
    slideDelta,
    viewerPage,
    totalPages,
    presenterSlide,
    presenterName: session?.presenterName ?? 'Presenter',

    // Viewer navigation (auto-explore)
    navigatePrev,
    navigateNext,
    navigateToPage,
    snapToPresenter,

    // Presenter navigation (authoritative)
    presenterNext,
    presenterPrev,
    presenterGoto,
  };
}
