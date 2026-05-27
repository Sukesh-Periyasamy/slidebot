/**
 * useThumbnailRenderer
 *
 * Renders a single PDF page as a thumbnail using the existing PDF.js renderer.
 * Uses IntersectionObserver for lazy rendering — off-screen thumbnails are not
 * rendered, keeping memory low for 100+ slide presentations.
 *
 * Features:
 * - Lazy rendering via IntersectionObserver
 * - DPR-aware canvas scaling (sharp on HiDPI)
 * - Render cancellation on unmount (no memory leaks)
 * - Fixed 16:9 aspect ratio placeholder before render completes
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

const THUMBNAIL_SCALE = 0.18; // Render at 18% of full page scale — enough for thumbnail quality

interface UseThumbnailRendererOptions {
  pdfDoc: PDFDocumentProxy | null;
  pageNumber: number;
  /** Whether this thumbnail is visible in the viewport */
  isVisible: boolean;
}

export function useThumbnailRenderer({
  pdfDoc,
  pageNumber,
  isVisible,
}: UseThumbnailRendererOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const isMountedRef = useRef(true);
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      renderTaskRef.current?.cancel();
    };
  }, []);

  const renderThumbnail = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !isVisible || isRendered) return;

    // Cancel any in-progress render
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let page: PDFPageProxy;
    try {
      page = await pdfDoc.getPage(pageNumber);
    } catch {
      return;
    }

    if (!isMountedRef.current || !canvasRef.current) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2); // Cap at 2x for memory efficiency
    const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    ctx.scale(dpr, dpr);

    try {
      renderTaskRef.current = page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      });

      await renderTaskRef.current.promise;

      if (isMountedRef.current) {
        setIsRendered(true);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
        console.warn('[Thumbnail] Render error:', err);
      }
    } finally {
      renderTaskRef.current = null;
      page.cleanup();
    }
  }, [pdfDoc, pageNumber, isVisible, isRendered]);

  // Trigger render when page becomes visible
  useEffect(() => {
    if (isVisible && !isRendered) {
      void renderThumbnail();
    }
  }, [isVisible, isRendered, renderThumbnail]);

  // Re-render if pdfDoc changes (new document loaded)
  useEffect(() => {
    setIsRendered(false);
  }, [pdfDoc, pageNumber]);

  return { canvasRef, isRendered };
}
