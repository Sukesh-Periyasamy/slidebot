import type { PDFDocumentProxy } from 'pdfjs-dist';
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ZoomPreset = 'fit' | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

interface ViewerState {
  // PDF document (heavy — do not serialize)
  pdfDoc: PDFDocumentProxy | null;
  pdfUrl: string | null;

  // Navigation
  currentPage: number;
  totalPages: number;

  // Rendering
  zoom: ZoomPreset;
  /** Computed scale factor (set by SlideCanvas based on container size) */
  computedScale: number;
  isLoading: boolean;
  isRendering: boolean;
  loadError: string | null;

  // UI state
  isFullscreen: boolean;
  isThumbnailStripOpen: boolean;
  areControlsVisible: boolean;

  // Actions
  setPdfDoc: (doc: PDFDocumentProxy, url: string) => void;
  setCurrentPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setZoom: (zoom: ZoomPreset) => void;
  setComputedScale: (scale: number) => void;
  setIsLoading: (loading: boolean) => void;
  setIsRendering: (rendering: boolean) => void;
  setLoadError: (error: string | null) => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  toggleThumbnailStrip: () => void;
  setControlsVisible: (visible: boolean) => void;
  reset: () => void;
}

const initialState = {
  pdfDoc: null,
  pdfUrl: null,
  currentPage: 1,
  totalPages: 0,
  zoom: 'fit' as ZoomPreset,
  computedScale: 1,
  isLoading: false,
  isRendering: false,
  loadError: null,
  isFullscreen: false,
  isThumbnailStripOpen: true,
  areControlsVisible: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Viewer Store
// ─────────────────────────────────────────────────────────────────────────────

export const useViewerStore = create<ViewerState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      ...initialState,

      setPdfDoc: (doc, url) =>
        set({
          pdfDoc: doc,
          pdfUrl: url,
          totalPages: doc.numPages,
          currentPage: 1,
          isLoading: false,
          loadError: null,
        }),

      setCurrentPage: (page) => {
        const { totalPages } = get();
        if (page < 1 || page > totalPages) return;
        set({ currentPage: page });
      },

      nextPage: () => {
        const { currentPage, totalPages } = get();
        if (currentPage < totalPages) set({ currentPage: currentPage + 1 });
      },

      prevPage: () => {
        const { currentPage } = get();
        if (currentPage > 1) set({ currentPage: currentPage - 1 });
      },

      setZoom: (zoom) => set({ zoom }),

      setComputedScale: (scale) => set({ computedScale: scale }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setIsRendering: (isRendering) => set({ isRendering }),

      setLoadError: (loadError) => set({ loadError, isLoading: false, isRendering: false }),

      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),

      toggleThumbnailStrip: () => set((s) => ({ isThumbnailStripOpen: !s.isThumbnailStripOpen })),

      setControlsVisible: (areControlsVisible) => set({ areControlsVisible }),

      reset: () =>
        set({
          ...initialState,
          // Preserve UI preferences
          isThumbnailStripOpen: get().isThumbnailStripOpen,
        }),
    })),
    { name: 'ViewerStore' }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectCurrentPage = (s: ViewerState) => s.currentPage;
export const selectTotalPages = (s: ViewerState) => s.totalPages;
export const selectZoom = (s: ViewerState) => s.zoom;
export const selectIsFullscreen = (s: ViewerState) => s.isFullscreen;
export const selectPdfDoc = (s: ViewerState) => s.pdfDoc;
export const selectIsLoading = (s: ViewerState) => s.isLoading;
export const selectCanGoNext = (s: ViewerState) => s.currentPage < s.totalPages;
export const selectCanGoPrev = (s: ViewerState) => s.currentPage > 1;

if (import.meta.env.DEV) {
  let prevState = useViewerStore.getState();
  useViewerStore.subscribe((nextState) => {
    const changedKeys = Object.keys(nextState as object).filter(
      (key) => (nextState as unknown as Record<string, unknown>)[key] !== (prevState as unknown as Record<string, unknown>)[key]
    );
    if (changedKeys.length > 0) {
      console.debug('[store:update]', {
        store: 'viewerStore',
        changedKeys,
      });
    }
    prevState = nextState;
  });
}
