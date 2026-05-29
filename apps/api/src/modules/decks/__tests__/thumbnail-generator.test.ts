import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mock functions that are available during vi.mock hoisting
const {
  mockSharp,
  mockSharpInstance,
  mockPdf,
  mockUpload,
  mockStorageFrom,
  mockDeckUpdate,
  mockLogger,
} = vi.hoisted(() => {
  const mockSharpInstance = {
    resize: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png-data')),
  };
  const mockSharp = vi.fn().mockReturnValue(mockSharpInstance);
  const mockPdf = vi.fn();
  const mockUpload = vi.fn().mockResolvedValue({ error: null });
  const mockStorageFrom = vi.fn().mockReturnValue({ upload: mockUpload });
  const mockDeckUpdate = vi.fn().mockResolvedValue({});
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return { mockSharp, mockSharpInstance, mockPdf, mockUpload, mockStorageFrom, mockDeckUpdate, mockLogger };
});

vi.mock('sharp', () => ({
  default: mockSharp,
  __esModule: true,
}));

vi.mock('pdf-to-img', () => ({
  pdf: mockPdf,
  __esModule: true,
}));

vi.mock('../../../config/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: mockStorageFrom,
    },
  },
}));

vi.mock('../../../config/database', () => ({
  prisma: {
    deck: {
      update: mockDeckUpdate,
    },
  },
}));

vi.mock('../../../config/env', () => ({
  env: {
    SUPABASE_STORAGE_BUCKET: 'presentations',
    REDIS_URL: 'redis://localhost:6379',
  },
}));

vi.mock('../../../config/logger', () => ({
  logger: mockLogger,
}));

import {
  generateThumbnails,
  generateAndUploadThumbnails,
  DEFAULT_THUMBNAIL_OPTIONS,
} from '../thumbnail-generator';

// ── Helpers ─────────────────────────────────────────────────────────────────

function createAsyncIterator(pages: Buffer[]) {
  let index = 0;
  return {
    length: pages.length,
    metadata: { Title: 'Test PDF' },
    getPage: vi.fn().mockImplementation((n: number) => Promise.resolve(pages[n - 1])),
    [Symbol.asyncIterator]() {
      index = 0;
      return {
        next() {
          if (index < pages.length) {
            return Promise.resolve({ value: pages[index++], done: false as const });
          }
          return Promise.resolve({ value: undefined, done: true as const });
        },
      };
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('thumbnail-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSharp.mockReturnValue(mockSharpInstance);
    mockSharpInstance.resize.mockReturnThis();
    mockSharpInstance.png.mockReturnThis();
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('fake-png-data'));
    mockUpload.mockResolvedValue({ error: null });
    mockDeckUpdate.mockResolvedValue({});
  });

  describe('DEFAULT_THUMBNAIL_OPTIONS', () => {
    it('has correct default dimensions and format', () => {
      expect(DEFAULT_THUMBNAIL_OPTIONS).toEqual({
        width: 320,
        height: 180,
        format: 'png',
      });
    });
  });

  describe('generateThumbnails', () => {
    it('generates thumbnails for each slide in the PDF', async () => {
      const pages = [
        Buffer.from('page-1-data'),
        Buffer.from('page-2-data'),
        Buffer.from('page-3-data'),
      ];
      mockPdf.mockResolvedValueOnce(createAsyncIterator(pages));

      const result = await generateThumbnails(
        Buffer.from('fake-pdf'),
        3,
        DEFAULT_THUMBNAIL_OPTIONS,
      );

      expect(result).toHaveLength(3);
      expect(mockPdf).toHaveBeenCalledWith(Buffer.from('fake-pdf'), { scale: 1.5 });
      expect(mockSharp).toHaveBeenCalledTimes(3);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(320, 180, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      });
    });

    it('limits output to slideCount even if PDF has more pages', async () => {
      const pages = [
        Buffer.from('page-1'),
        Buffer.from('page-2'),
        Buffer.from('page-3'),
        Buffer.from('page-4'),
      ];
      mockPdf.mockResolvedValueOnce(createAsyncIterator(pages));

      const result = await generateThumbnails(
        Buffer.from('fake-pdf'),
        2,
        DEFAULT_THUMBNAIL_OPTIONS,
      );

      expect(result).toHaveLength(2);
      expect(mockSharp).toHaveBeenCalledTimes(2);
    });

    it('continues processing when a single slide fails and inserts empty buffer', async () => {
      const pages = [
        Buffer.from('page-1'),
        Buffer.from('page-2-bad'),
        Buffer.from('page-3'),
      ];
      mockPdf.mockResolvedValueOnce(createAsyncIterator(pages));

      // Make the second page fail during sharp processing
      let callCount = 0;
      mockSharp.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return {
            resize: vi.fn().mockReturnThis(),
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error('Sharp processing failed')),
          };
        }
        return mockSharpInstance;
      });

      const result = await generateThumbnails(
        Buffer.from('fake-pdf'),
        3,
        DEFAULT_THUMBNAIL_OPTIONS,
      );

      expect(result).toHaveLength(3);
      // Second thumbnail should be an empty buffer (failed)
      expect(result[1]!.length).toBe(0);
      // First and third should have data
      expect(result[0]!.length).toBeGreaterThan(0);
      expect(result[2]!.length).toBeGreaterThan(0);
    });

    it('returns empty array when PDF fails to open', async () => {
      mockPdf.mockRejectedValueOnce(new Error('Invalid PDF'));

      const result = await generateThumbnails(
        Buffer.from('bad-pdf'),
        3,
        DEFAULT_THUMBNAIL_OPTIONS,
      );

      expect(result).toEqual([]);
    });
  });

  describe('generateAndUploadThumbnails', () => {
    beforeEach(() => {
      const pages = [Buffer.from('page-1'), Buffer.from('page-2')];
      mockPdf.mockResolvedValue(createAsyncIterator(pages));
    });

    it('uploads thumbnails to Supabase Storage under the correct prefix', async () => {
      const result = await generateAndUploadThumbnails(
        'deck-123',
        'user-456',
        Buffer.from('fake-pdf'),
        2,
      );

      expect(mockStorageFrom).toHaveBeenCalledWith('presentations');
      expect(mockUpload).toHaveBeenCalledTimes(2);
      expect(mockUpload).toHaveBeenCalledWith(
        'user-456/deck-123/thumbnails/slide-001.png',
        expect.any(Buffer),
        { contentType: 'image/png', upsert: true },
      );
      expect(mockUpload).toHaveBeenCalledWith(
        'user-456/deck-123/thumbnails/slide-002.png',
        expect.any(Buffer),
        { contentType: 'image/png', upsert: true },
      );
      expect(result.thumbnailPaths).toHaveLength(2);
      expect(result.failedSlides).toHaveLength(0);
    });

    it('updates Deck record with thumbnailPrefix', async () => {
      await generateAndUploadThumbnails(
        'deck-123',
        'user-456',
        Buffer.from('fake-pdf'),
        2,
      );

      expect(mockDeckUpdate).toHaveBeenCalledWith({
        where: { id: 'deck-123' },
        data: { thumbnailPrefix: 'user-456/deck-123/thumbnails' },
      });
    });

    it('continues uploading when a single upload fails', async () => {
      // First upload fails, second succeeds
      mockUpload
        .mockResolvedValueOnce({ error: { message: 'Upload failed' } })
        .mockResolvedValueOnce({ error: null });

      const result = await generateAndUploadThumbnails(
        'deck-abc',
        'user-xyz',
        Buffer.from('fake-pdf'),
        2,
      );

      expect(result.failedSlides).toContain(0);
      expect(result.thumbnailPaths).toHaveLength(1);
      expect(result.thumbnailPaths[0]).toBe('user-xyz/deck-abc/thumbnails/slide-002.png');
    });

    it('skips upload for empty buffers from failed generation', async () => {
      // Simulate one page failing during generation
      const pages = [Buffer.from('page-1'), Buffer.from('page-2')];
      mockPdf.mockResolvedValueOnce(createAsyncIterator(pages));

      let callCount = 0;
      mockSharp.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            resize: vi.fn().mockReturnThis(),
            png: vi.fn().mockReturnThis(),
            toBuffer: vi.fn().mockRejectedValue(new Error('Failed')),
          };
        }
        return mockSharpInstance;
      });

      const result = await generateAndUploadThumbnails(
        'deck-fail',
        'user-1',
        Buffer.from('fake-pdf'),
        2,
      );

      // Only one upload should happen (the second slide)
      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(result.failedSlides).toContain(0);
    });

    it('still updates Deck record even if some thumbnails fail', async () => {
      mockUpload.mockResolvedValue({ error: { message: 'All uploads fail' } });

      await generateAndUploadThumbnails(
        'deck-all-fail',
        'user-1',
        Buffer.from('fake-pdf'),
        2,
      );

      // Deck record should still be updated with the prefix
      expect(mockDeckUpdate).toHaveBeenCalledWith({
        where: { id: 'deck-all-fail' },
        data: { thumbnailPrefix: 'user-1/deck-all-fail/thumbnails' },
      });
    });

    it('handles Deck update failure gracefully without throwing', async () => {
      mockDeckUpdate.mockRejectedValueOnce(new Error('DB error'));

      // Should not throw
      const result = await generateAndUploadThumbnails(
        'deck-db-fail',
        'user-1',
        Buffer.from('fake-pdf'),
        2,
      );

      expect(result.thumbnailPaths).toHaveLength(2);
    });
  });
});
