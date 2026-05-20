import { useEffect, useRef, useCallback } from 'react';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';

import { useViewerStore } from '../store/viewerStore';

interface UsePdfRendererOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  pageNumber: number;
  /** Fixed scale (overrides zoom calculation). Used for thumbnails. */
  fixedScale?: number;
}

/**
 * usePdfRenderer — renders a single PDF page onto a <canvas> element.
 *
 * Handles:
 * - Device pixel ratio scaling (crisp rendering on HiDPI screens)
 * - Render cancellation on page change (prevents race conditions)
 * - Container resize via ResizeObserver
 *
 * @returns { isRendering } — true while page is being drawn
 */
export function usePdfRenderer({
  canvasRef,
  pageNumber,
  fixedScale,
}: UsePdfRendererOptions) {
  const pdfDoc = useViewerStore((s) => s.pdfDoc);
  const zoom = useViewerStore((s) => s.zoom);
  const containerScale = useViewerStore((s) => s.computedScale);
  const setIsRendering = useViewerStore((s) => s.setIsRendering);
  const setComputedScale = useViewerStore((s) => s.setComputedScale);

  // Track active render task for cancellation
  const renderTaskRef = useRef<RenderTask | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let page: PDFPageProxy;
    try {
      page = await pdfDoc.getPage(pageNumber);
    } catch {
      return; // Page number out of range or doc destroyed
    }

    if (!isMountedRef.current || !canvasRef.current) return;

    const dpr = window.devicePixelRatio || 1;

    // Determine rendering scale
    let scale: number;
    if (fixedScale !== undefined) {
      scale = fixedScale;
    } else if (zoom === 'fit') {
      // Calculate scale to fit the canvas inside its container
      const container = canvas.parentElement;
      if (!container) return;

      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;

      const scaleX = containerWidth / viewport.width;
      const scaleY = containerHeight / viewport.height;
      scale = Math.min(scaleX, scaleY) * 0.95; // 5% padding
      setComputedScale(scale);
    } else {
      scale = zoom as number;
    }

    const viewport = page.getViewport({ scale });

    // Set canvas physical size (DPR-aware for crisp rendering)
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);

    // Set CSS display size
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    // Scale context for DPR
    ctx.scale(dpr, dpr);

    if (!fixedScale) setIsRendering(true);

    try {
      renderTaskRef.current = page.render({
        canvasContext: ctx,
        viewport,
        intent: fixedScale ? 'print' : 'display',
      });

      await renderTaskRef.current.promise;
    } catch (err: unknown) {
      // Silently ignore cancelled renders
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
        console.error('[PDF Renderer] Render error:', err);
      }
    } finally {
      if (isMountedRef.current && !fixedScale) {
        setIsRendering(false);
      }
      renderTaskRef.current = null;
      page.cleanup();
    }
  }, [pdfDoc, pageNumber, zoom, fixedScale, canvasRef, setIsRendering, setComputedScale]);

  // Re-render on page change, zoom change, or doc load
  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  // Re-render on container resize (for 'fit' zoom mode)
  useEffect(() => {
    if (fixedScale || !canvasRef.current) return;

    const container = canvasRef.current.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      void renderPage();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [renderPage, fixedScale, canvasRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      renderTaskRef.current?.cancel();
    };
  }, []);
}
