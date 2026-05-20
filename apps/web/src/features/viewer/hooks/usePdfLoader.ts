import { useState, useCallback, useEffect, useRef } from 'react';
import { pdfjsLib } from '@/lib/pdfWorker';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { useViewerStore } from '../store/viewerStore';

/**
 * usePdfLoader — loads a PDF document from a URL or File object.
 *
 * @example
 * const { loadFromUrl, loadFromFile } = usePdfLoader();
 * await loadFromUrl('https://storage.example.com/decks/123/presentation.pdf');
 */
export function usePdfLoader() {
  const setPdfDoc = useViewerStore((s) => s.setPdfDoc);
  const setIsLoading = useViewerStore((s) => s.setIsLoading);
  const setLoadError = useViewerStore((s) => s.setLoadError);
  const reset = useViewerStore((s) => s.reset);

  // Keep reference to current doc for cleanup
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const loadDocument = useCallback(
    async (source: string | ArrayBuffer) => {
      // Cleanup previous document
      if (docRef.current) {
        await docRef.current.destroy();
        docRef.current = null;
      }
      reset();
      setIsLoading(true);
      setLoadError(null);

      try {
        const loadingTask = pdfjsLib.getDocument(
          typeof source === 'string'
            ? { url: source, cMapUrl: 'pdfjs-dist/cmaps/', cMapPacked: true }
            : { data: source }
        );

        const doc = await loadingTask.promise;
        docRef.current = doc;
        setPdfDoc(doc, typeof source === 'string' ? source : 'file://local');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load PDF';
        setLoadError(`Could not load presentation: ${message}`);
        console.error('[usePdfLoader]', err);
      }
    },
    [setPdfDoc, setIsLoading, setLoadError, reset]
  );

  const loadFromUrl = useCallback(
    (url: string) => loadDocument(url),
    [loadDocument]
  );

  const loadFromFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      await loadDocument(buffer);
    },
    [loadDocument]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void docRef.current?.destroy();
    };
  }, []);

  return { loadFromUrl, loadFromFile };
}
