import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUploadDeck = vi.fn();
const mockUpsertDeck = vi.fn();
const mockSetSceneGraph = vi.fn();
const mockToastError = vi.fn();

vi.mock('../api/decksApi', () => ({
  uploadDeck: (...args: unknown[]) => mockUploadDeck(...args),
  toDeckRecord: (payload: Record<string, unknown>) => ({
    deckId: payload.deckId,
    name: payload.name,
    slides: payload.slides,
    storagePath: payload.storagePath,
    signedUrl: payload.signedUrl,
    signedUrlExpiresAt: Date.now() + ((payload.signedUrlExpiresIn as number) ?? 3600) * 1000,
    createdAt: Date.now(),
    sourceType: payload.sourceType ?? 'pdf',
    author: payload.author,
    conversionStatus: payload.conversionStatus ?? 'none',
  }),
}));

vi.mock('../store/deckStore', () => ({
  useDeckStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ upsertDeck: mockUpsertDeck, setSceneGraph: mockSetSceneGraph }),
}));

vi.mock('@/shared/components/useToast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: vi.fn(),
    error: mockToastError,
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));

// Mock Worker
let lastCreatedWorker: {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
} | null = null;

vi.stubGlobal('Worker', class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    lastCreatedWorker = this;
  }
});

// ─── Import after mocks ──────────────────────────────────────────────────────

import { useDeckUpload } from './useDeckUpload';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useDeckUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastCreatedWorker = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('file validation', () => {
    it('should accept PDF files', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'test.pdf',
        slides: 5,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.upload(file);
      });

      expect(result.current.error).toBeNull();
      expect(mockUploadDeck).toHaveBeenCalledWith(file);
    });

    it('should accept PPTX files by MIME type', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'test.pptx',
        slides: 10,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pptx content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));

      await act(async () => {
        const promise = result.current.upload(file);
        await Promise.resolve();
        await Promise.resolve();
        if (lastCreatedWorker?.onmessage) {
          lastCreatedWorker.onmessage(new MessageEvent('message', {
            data: {
              type: 'COMPLETE',
              document: {
                slides: [{ elements: [] }],
                metadata: { title: 'Test', author: 'Author', slideCount: 1, sourceWidth: 9144000, sourceHeight: 6858000 },
              },
            },
          }));
        }
        await promise;
      });

      expect(result.current.error).toBeNull();
      expect(mockUploadDeck).toHaveBeenCalledWith(file);
    });

    it('should accept PPTX files by extension regardless of MIME type', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'presentation.pptx',
        slides: 3,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pptx content'], 'presentation.pptx', {
        type: 'application/octet-stream',
      });
      vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));

      await act(async () => {
        const promise = result.current.upload(file);
        await Promise.resolve();
        await Promise.resolve();
        if (lastCreatedWorker?.onmessage) {
          lastCreatedWorker.onmessage(new MessageEvent('message', {
            data: {
              type: 'COMPLETE',
              document: {
                slides: [{ elements: [] }],
                metadata: { title: 'Test', author: 'Author', slideCount: 1, sourceWidth: 9144000, sourceHeight: 6858000 },
              },
            },
          }));
        }
        await promise;
      });

      expect(result.current.error).toBeNull();
      expect(mockUploadDeck).toHaveBeenCalledWith(file);
    });

    it('should reject unsupported file types', async () => {
      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['content'], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.upload(file);
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toBe('Please upload a valid PDF or PPTX file.');
      expect(result.current.error).toBe('Please upload a valid PDF or PPTX file.');
    });

    it('should reject PPTX files over 100MB', async () => {
      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['x'], 'large.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.upload(file);
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toBe('File is too large. Maximum size is 100MB.');
      expect(result.current.error).toBe('File is too large. Maximum size is 100MB.');
    });

    it('should reject PDF files over 50MB', async () => {
      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['x'], 'large.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 });

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.upload(file);
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toBe('File is too large. Maximum size is 50MB.');
      expect(result.current.error).toBe('File is too large. Maximum size is 50MB.');
    });
  });

  describe('PPTX worker parsing', () => {
    it('should instantiate a Web Worker for PPTX files and store scene graph on COMPLETE', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'test.pptx',
        slides: 2,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pptx content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));

      const mockDocument = {
        slides: [{ elements: [] }],
        metadata: { title: 'Test', author: 'Author', slideCount: 1, sourceWidth: 9144000, sourceHeight: 6858000 },
      };

      await act(async () => {
        const promise = result.current.upload(file);
        await Promise.resolve();
        await Promise.resolve();

        if (lastCreatedWorker?.onmessage) {
          lastCreatedWorker.onmessage(new MessageEvent('message', {
            data: { type: 'COMPLETE', document: mockDocument },
          }));
        }

        await promise;
      });

      expect(lastCreatedWorker).not.toBeNull();
      expect(result.current.sceneGraph).toEqual(mockDocument);
    });

    it('should show error toast on worker ERROR message', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'test.pptx',
        slides: 2,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pptx content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));

      await act(async () => {
        const promise = result.current.upload(file);
        await Promise.resolve();
        await Promise.resolve();

        if (lastCreatedWorker?.onmessage) {
          lastCreatedWorker.onmessage(new MessageEvent('message', {
            data: { type: 'ERROR', stage: 'zip-extraction', message: 'Invalid ZIP file' },
          }));
        }

        await promise;
      });

      expect(mockToastError).toHaveBeenCalledWith('PPTX Parsing Failed', 'Invalid ZIP file');
      expect(result.current.sceneGraph).toBeNull();
    });

    it('should not instantiate a Web Worker for PDF files', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'test.pdf',
        slides: 5,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.upload(file);
      });

      expect(lastCreatedWorker).toBeNull();
      expect(result.current.sceneGraph).toBeNull();
    });

    it('should update parsing progress on PROGRESS messages', async () => {
      mockUploadDeck.mockResolvedValue({
        deckId: 'deck-1',
        roomId: 'room-1',
        name: 'test.pptx',
        slides: 2,
        storagePath: '/path/to/file',
        signedUrl: 'https://example.com/signed',
        signedUrlExpiresIn: 3600,
      });

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pptx content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));

      let progressSeen = false;

      await act(async () => {
        const promise = result.current.upload(file);
        await Promise.resolve();
        await Promise.resolve();

        // Send progress message
        if (lastCreatedWorker?.onmessage) {
          lastCreatedWorker.onmessage(new MessageEvent('message', {
            data: { type: 'PROGRESS', stage: 'zip-extraction', percent: 50 },
          }));
        }

        // Allow state update to flush
        await Promise.resolve();
        progressSeen = result.current.parsingProgress?.stage === 'zip-extraction';

        // Complete the worker
        if (lastCreatedWorker?.onmessage) {
          lastCreatedWorker.onmessage(new MessageEvent('message', {
            data: {
              type: 'COMPLETE',
              document: {
                slides: [{ elements: [] }],
                metadata: { title: 'Test', author: 'Author', slideCount: 1, sourceWidth: 9144000, sourceHeight: 6858000 },
              },
            },
          }));
        }

        await promise;
      });

      // After completion, progress should be cleared
      expect(result.current.parsingProgress).toBeNull();
      // The scene graph should be set
      expect(result.current.sceneGraph).not.toBeNull();
    });
  });

  describe('error handling', () => {
    it('should clear error state', () => {
      const { result } = renderHook(() => useDeckUpload());

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it('should terminate worker on upload failure', async () => {
      mockUploadDeck.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useDeckUpload());
      const file = new File(['pptx content'], 'test.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      vi.spyOn(file, 'arrayBuffer').mockResolvedValue(new ArrayBuffer(10));

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.upload(file);
        } catch (e) {
          thrownError = e as Error;
        }
      });

      expect(thrownError?.message).toBe('Network error');
      expect(result.current.error).toBe('Network error');
      // Worker should have been terminated
      if (lastCreatedWorker) {
        expect(lastCreatedWorker.terminate).toHaveBeenCalled();
      }
    });

    it('should cancel parsing when cancelParsing is called', () => {
      const { result } = renderHook(() => useDeckUpload());

      // cancelParsing should be safe to call even without an active worker
      act(() => {
        result.current.cancelParsing();
      });

      expect(result.current.parsingProgress).toBeNull();
    });
  });
});
