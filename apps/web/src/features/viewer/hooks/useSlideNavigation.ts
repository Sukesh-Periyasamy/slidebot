import { useEffect, useCallback } from 'react';

import { selectCanGoNext, selectCanGoPrev, useViewerStore } from '../store/viewerStore';

/**
 * useSlideNavigation — keyboard shortcuts and navigation actions.
 *
 * Keyboard bindings (active when not in an input field):
 * - ArrowRight / Space / PageDown → next slide
 * - ArrowLeft / PageUp           → previous slide
 * - Home                         → first slide
 * - End                          → last slide
 * - f / F11                      → toggle fullscreen
 * - Escape                       → exit fullscreen
 */
export function useSlideNavigation() {
  const nextPage = useViewerStore((s) => s.nextPage);
  const prevPage = useViewerStore((s) => s.prevPage);
  const setCurrentPage = useViewerStore((s) => s.setCurrentPage);
  const totalPages = useViewerStore((s) => s.totalPages);
  const canGoNext = useViewerStore(selectCanGoNext);
  const canGoPrev = useViewerStore(selectCanGoPrev);
  const isFullscreen = useViewerStore((s) => s.isFullscreen);
  const setIsFullscreen = useViewerStore((s) => s.setIsFullscreen);

  const goToFirst = useCallback(() => setCurrentPage(1), [setCurrentPage]);
  const goToLast = useCallback(() => setCurrentPage(totalPages), [setCurrentPage, totalPages]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('[Viewer] Fullscreen not available:', err);
    }
  }, []);

  // Sync isFullscreen state with browser fullscreen events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [setIsFullscreen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          nextPage();
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          prevPage();
          break;

        case 'Home':
          e.preventDefault();
          goToFirst();
          break;

        case 'End':
          e.preventDefault();
          goToLast();
          break;

        case 'f':
        case 'F11':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            void toggleFullscreen();
          }
          break;

        case 'Escape':
          if (isFullscreen) {
            void document.exitFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, goToFirst, goToLast, toggleFullscreen, isFullscreen]);

  return {
    nextPage,
    prevPage,
    goToFirst,
    goToLast,
    canGoNext,
    canGoPrev,
    toggleFullscreen,
    isFullscreen,
  };
}
