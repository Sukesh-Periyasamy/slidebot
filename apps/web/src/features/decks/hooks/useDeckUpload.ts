import { useCallback, useRef, useState } from 'react';

import { uploadDeck, toDeckRecord } from '../api/decksApi';
import { useDeckStore } from '../store/deckStore';
import { useToast } from '@/shared/components/useToast';
import type { PresentationDocument } from '@slidebot/shared-types/scene-graph';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PPTX_BYTES = 100 * 1024 * 1024;

// ─── Worker Message Types ────────────────────────────────────────────────────

type ParsingStage = 'zip-extraction' | 'xml-parsing' | 'scene-graph-construction';

interface PptxProgressMessage {
  type: 'PROGRESS';
  stage: ParsingStage;
  percent: number;
}

interface PptxCompleteMessage {
  type: 'COMPLETE';
  document: PresentationDocument;
}

interface PptxErrorMessage {
  type: 'ERROR';
  stage: ParsingStage;
  message: string;
}

type PptxParserResponse = PptxProgressMessage | PptxCompleteMessage | PptxErrorMessage;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPptxFile(file: File): boolean {
  const pptxMime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  return file.type === pptxMime || file.name.toLowerCase().endsWith('.pptx');
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDeckUpload() {
  const upsertDeck = useDeckStore((s) => s.upsertDeck);
  const storeSceneGraph = useDeckStore((s) => s.setSceneGraph);
  const toast = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneGraph, setSceneGraph] = useState<PresentationDocument | null>(null);
  const [parsingProgress, setParsingProgress] = useState<{ stage: ParsingStage; percent: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (isPptxFile(file)) {
      if (file.size > MAX_PPTX_BYTES) {
        return 'File is too large. Maximum size is 100MB.';
      }
      return null;
    }

    if (isPdfFile(file)) {
      if (file.size > MAX_PDF_BYTES) {
        return 'File is too large. Maximum size is 50MB.';
      }
      return null;
    }

    return 'Please upload a valid PDF or PPTX file.';
  }, []);

  /**
   * Starts the Web Worker to parse a PPTX file client-side for immediate preview.
   * Returns a promise that resolves with the PresentationDocument or null on error.
   */
  const parsePptxInWorker = useCallback((file: File): Promise<PresentationDocument | null> => {
    return new Promise((resolve) => {
      try {
        const worker = new Worker(
          new URL('../workers/pptx-parser.worker.ts', import.meta.url),
          { type: 'module' }
        );
        workerRef.current = worker;

        worker.onmessage = (event: MessageEvent<PptxParserResponse>) => {
          const msg = event.data;

          switch (msg.type) {
            case 'PROGRESS':
              setParsingProgress({ stage: msg.stage, percent: msg.percent });
              break;

            case 'COMPLETE':
              setSceneGraph(msg.document);
              setParsingProgress(null);
              worker.terminate();
              workerRef.current = null;
              resolve(msg.document);
              break;

            case 'ERROR':
              toast.error('PPTX Parsing Failed', msg.message);
              setParsingProgress(null);
              worker.terminate();
              workerRef.current = null;
              resolve(null);
              break;
          }
        };

        worker.onerror = (event) => {
          toast.error('PPTX Parsing Failed', event.message || 'An unexpected error occurred while parsing the file.');
          setParsingProgress(null);
          worker.terminate();
          workerRef.current = null;
          resolve(null);
        };

        // Read the file as ArrayBuffer and send to worker
        file.arrayBuffer().then((buffer) => {
          worker.postMessage({ type: 'PARSE', file: buffer }, [buffer]);
        }).catch((readError) => {
          const message = readError instanceof Error ? readError.message : 'Failed to read file.';
          toast.error('PPTX Parsing Failed', message);
          worker.terminate();
          workerRef.current = null;
          resolve(null);
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start PPTX parser.';
        toast.error('PPTX Parsing Failed', message);
        resolve(null);
      }
    });
  }, [toast]);

  const upload = useCallback(
    async (file: File): Promise<{ deckId: string; roomId: string }> => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        throw new Error(validationError);
      }

      setIsUploading(true);
      setError(null);
      setSceneGraph(null);
      setParsingProgress(null);

      try {
        // For PPTX files: start client-side parsing AND server upload simultaneously
        const isPptx = isPptxFile(file);

        // Start both operations in parallel
        const uploadPromise = uploadDeck(file);
        const parsePromise = isPptx ? parsePptxInWorker(file) : Promise.resolve(null);

        // Wait for both to settle — upload is required, parsing is best-effort
        const [payload, parsedDoc] = await Promise.all([
          uploadPromise,
          parsePromise,
        ]);

        if (!payload.roomId) {
          throw new Error('Upload succeeded but room creation failed.');
        }

        const deckRecord = toDeckRecord(payload);
        upsertDeck(deckRecord);

        // If PPTX parsing produced a Scene Graph, store it in the deck record
        if (isPptx && parsedDoc) {
          storeSceneGraph(payload.deckId, parsedDoc);
        }

        setIsUploading(false);
        return { deckId: payload.deckId, roomId: payload.roomId };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload presentation.';
        setError(message);
        setIsUploading(false);
        // Terminate worker if still running
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        throw err;
      }
    },
    [upsertDeck, storeSceneGraph, validateFile, parsePptxInWorker]
  );

  const cancelParsing = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'CANCEL' });
      workerRef.current.terminate();
      workerRef.current = null;
      setParsingProgress(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    upload,
    isUploading,
    error,
    clearError,
    sceneGraph,
    parsingProgress,
    cancelParsing,
  };
}
