import { useState, useCallback, useRef } from 'react';
import type { PdfExportOptions, PdfExportMessage, PdfExportResponse } from './pdfExport.worker';

export type ExportStatus = 'idle' | 'exporting' | 'complete' | 'error';

export function useExportManager() {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const startPdfExport = useCallback(async (options: PdfExportOptions) => {
    setStatus('exporting');
    setProgress(0);
    setError(null);

    // Dynamic import to support Vite worker bundling
    const WorkerClass = await import('./pdfExport.worker?worker');
    workerRef.current = new WorkerClass.default();

    workerRef.current.onmessage = (e: MessageEvent<PdfExportResponse>) => {
      const msg = e.data;
      if (msg.type === 'PROGRESS') {
        setProgress(msg.progress);
      } else if (msg.type === 'COMPLETE') {
        setStatus('complete');
        setProgress(100);
        
        // Trigger download
        const url = URL.createObjectURL(msg.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deck-${options.deckId}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        workerRef.current?.terminate();
        workerRef.current = null;
      } else if (msg.type === 'ERROR') {
        setStatus('error');
        setError(msg.error);
        workerRef.current?.terminate();
        workerRef.current = null;
      }
    };

    workerRef.current.postMessage({ type: 'START_EXPORT', options } as PdfExportMessage);
  }, []);

  const cancelExport = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL_EXPORT' } as PdfExportMessage);
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
    setError(null);
  }, []);

  return {
    status,
    progress,
    error,
    startPdfExport,
    cancelExport
  };
}
