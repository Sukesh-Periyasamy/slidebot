import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockApplyConversionStatus = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastWarning = vi.fn();

type StatusListener = (status: string) => void;
let statusListeners: StatusListener[] = [];
let mockSocket: {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
} | null = null;

vi.mock('@/features/collaboration/lib/socketManager', () => ({
  socketManager: {
    getCollaborationSocket: () => mockSocket,
    onStatusChange: (listener: StatusListener) => {
      statusListeners.push(listener);
      return () => {
        statusListeners = statusListeners.filter((l) => l !== listener);
      };
    },
  },
}));

vi.mock('../store/deckStore', () => ({
  useDeckStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ applyConversionStatus: mockApplyConversionStatus }),
}));

vi.mock('@/shared/components/useToast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    success: mockToastSuccess,
    error: vi.fn(),
    info: vi.fn(),
    warning: mockToastWarning,
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { useConversionStatus } from './useConversionStatus';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useConversionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statusListeners = [];
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not attach listener when deckId is null', () => {
    renderHook(() => useConversionStatus(null));

    expect(mockSocket!.on).not.toHaveBeenCalled();
  });

  it('should not attach listener when deckId is undefined', () => {
    renderHook(() => useConversionStatus(undefined));

    expect(mockSocket!.on).not.toHaveBeenCalled();
  });

  it('should attach conversion_status listener on the collaboration socket', () => {
    renderHook(() => useConversionStatus('deck-123'));

    expect(mockSocket!.on).toHaveBeenCalledWith('conversion_status', expect.any(Function));
  });

  it('should detach listener on unmount', () => {
    const { unmount } = renderHook(() => useConversionStatus('deck-123'));

    unmount();

    expect(mockSocket!.off).toHaveBeenCalledWith('conversion_status', expect.any(Function));
  });

  it('should update deck store on conversion completed', () => {
    renderHook(() => useConversionStatus('deck-123'));

    // Get the handler that was registered
    const handler = mockSocket!.on.mock.calls[0][1];

    act(() => {
      handler({
        deckId: 'deck-123',
        status: 'completed',
        pdfStoragePath: '/decks/deck-123/output.pdf',
        thumbnailPaths: ['/decks/deck-123/thumbnails/slide-1.png'],
      });
    });

    expect(mockApplyConversionStatus).toHaveBeenCalledWith({
      deckId: 'deck-123',
      status: 'completed',
      pdfStoragePath: '/decks/deck-123/output.pdf',
      thumbnailPaths: ['/decks/deck-123/thumbnails/slide-1.png'],
    });
  });

  it('should show success toast on conversion completed', () => {
    renderHook(() => useConversionStatus('deck-123'));

    const handler = mockSocket!.on.mock.calls[0][1];

    act(() => {
      handler({
        deckId: 'deck-123',
        status: 'completed',
        pdfStoragePath: '/decks/deck-123/output.pdf',
      });
    });

    expect(mockToastSuccess).toHaveBeenCalledWith(
      'PDF Ready',
      'High-fidelity PDF rendering is now available.',
    );
  });

  it('should update deck store on conversion failed', () => {
    renderHook(() => useConversionStatus('deck-123'));

    const handler = mockSocket!.on.mock.calls[0][1];

    act(() => {
      handler({
        deckId: 'deck-123',
        status: 'failed',
        error: 'LibreOffice timeout',
      });
    });

    expect(mockApplyConversionStatus).toHaveBeenCalledWith({
      deckId: 'deck-123',
      status: 'failed',
      error: 'LibreOffice timeout',
    });
  });

  it('should show warning toast on conversion failed', () => {
    renderHook(() => useConversionStatus('deck-123'));

    const handler = mockSocket!.on.mock.calls[0][1];

    act(() => {
      handler({
        deckId: 'deck-123',
        status: 'failed',
        error: 'LibreOffice timeout',
      });
    });

    expect(mockToastWarning).toHaveBeenCalledWith(
      'PDF Conversion Unavailable',
      'High-fidelity rendering is unavailable. The Scene Graph remains the primary source.',
    );
  });

  it('should ignore events for other deck IDs', () => {
    renderHook(() => useConversionStatus('deck-123'));

    const handler = mockSocket!.on.mock.calls[0][1];

    act(() => {
      handler({
        deckId: 'deck-other',
        status: 'completed',
        pdfStoragePath: '/decks/deck-other/output.pdf',
      });
    });

    expect(mockApplyConversionStatus).not.toHaveBeenCalled();
    expect(mockToastSuccess).not.toHaveBeenCalled();
  });

  it('should wait for socket connection if not immediately available', () => {
    mockSocket = null;

    renderHook(() => useConversionStatus('deck-123'));

    // No listener attached yet
    expect(statusListeners.length).toBe(1);

    // Simulate socket becoming available
    mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
    };

    act(() => {
      statusListeners[0]('connected');
    });

    // Now the listener should be attached
    expect(mockSocket.on).toHaveBeenCalledWith('conversion_status', expect.any(Function));
  });

  it('should not include undefined optional fields in the conversion event', () => {
    renderHook(() => useConversionStatus('deck-123'));

    const handler = mockSocket!.on.mock.calls[0][1];

    act(() => {
      handler({
        deckId: 'deck-123',
        status: 'completed',
        // pdfStoragePath and thumbnailPaths are undefined
      });
    });

    const callArg = mockApplyConversionStatus.mock.calls[0][0];
    expect(callArg).toEqual({
      deckId: 'deck-123',
      status: 'completed',
    });
    expect('pdfStoragePath' in callArg).toBe(false);
    expect('thumbnailPaths' in callArg).toBe(false);
  });

  it('should re-attach listener when deckId changes', () => {
    const { rerender } = renderHook(
      ({ deckId }) => useConversionStatus(deckId),
      { initialProps: { deckId: 'deck-123' as string | null } },
    );

    expect(mockSocket!.on).toHaveBeenCalledTimes(1);

    rerender({ deckId: 'deck-456' });

    // Should have detached old and attached new
    expect(mockSocket!.off).toHaveBeenCalledWith('conversion_status', expect.any(Function));
    expect(mockSocket!.on).toHaveBeenCalledTimes(2);
  });
});
