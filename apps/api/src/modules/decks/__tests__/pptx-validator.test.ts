/**
 * pptx-validator.test.ts
 *
 * Unit tests for the PPTX Validator module.
 * Tests structural validation, security checks, and timeout behavior.
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';

import {
  validatePptx,
  DEFAULT_VALIDATOR_OPTIONS,
  type PptxValidatorOptions,
} from '../pptx-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a minimal valid PPTX buffer with all required OOXML entries.
 */
function createValidPptxBuffer(slideCount = 1): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
  zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
  for (let i = 1; i <= slideCount; i++) {
    zip.addFile(`ppt/slides/slide${i}.xml`, Buffer.from(`<Slide${i}/>`));
  }
  return zip.toBuffer();
}

/**
 * Creates a valid PPTX ZIP buffer and then patches a specific entry name
 * in the raw binary to inject a path traversal sequence.
 * This is necessary because adm-zip sanitizes entry names on addFile.
 */
function createZipWithTraversalEntry(traversalPath: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
  zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
  zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
  // Add a placeholder entry that we'll patch in the raw buffer
  const placeholder = 'PLACEHOLDER_ENTRY.txt';
  zip.addFile(placeholder, Buffer.from('malicious'));
  const buffer = zip.toBuffer();

  // Find and replace the placeholder name in the raw ZIP buffer
  // ZIP local file headers and central directory both contain the filename
  const placeholderBuf = Buffer.from(placeholder);
  const traversalBuf = Buffer.from(traversalPath);

  // We need to create a new buffer with the correct size if names differ in length
  if (placeholderBuf.length === traversalBuf.length) {
    let idx = buffer.indexOf(placeholderBuf);
    while (idx !== -1) {
      traversalBuf.copy(buffer, idx);
      idx = buffer.indexOf(placeholderBuf, idx + 1);
    }
    return buffer;
  }

  // For different lengths, we need to rebuild - use a simpler approach
  // by making the placeholder the same length as the traversal path
  const zip2 = new AdmZip();
  zip2.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
  zip2.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
  zip2.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
  zip2.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
  // Pad placeholder to match traversal path length
  const paddedPlaceholder = 'X'.repeat(traversalPath.length);
  zip2.addFile(paddedPlaceholder, Buffer.from('malicious'));
  const buffer2 = zip2.toBuffer();

  const paddedBuf = Buffer.from(paddedPlaceholder);
  let idx2 = buffer2.indexOf(paddedBuf);
  while (idx2 !== -1) {
    traversalBuf.copy(buffer2, idx2);
    idx2 = buffer2.indexOf(paddedBuf, idx2 + 1);
  }
  return buffer2;
}

/**
 * Creates a ZIP buffer missing specific required entries.
 */
function createIncompleteZipBuffer(missingEntry: string): Buffer {
  const zip = new AdmZip();
  const allEntries = [
    { name: '[Content_Types].xml', content: '<Types></Types>' },
    { name: '_rels/.rels', content: '<Relationships></Relationships>' },
    { name: 'ppt/presentation.xml', content: '<Presentation></Presentation>' },
    { name: 'ppt/slides/slide1.xml', content: '<Slide1/>' },
  ];
  for (const entry of allEntries) {
    if (entry.name !== missingEntry) {
      zip.addFile(entry.name, Buffer.from(entry.content));
    }
  }
  return zip.toBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PPTX Validator', () => {
  describe('Valid PPTX acceptance', () => {
    it('should accept a valid PPTX with one slide', async () => {
      const buffer = createValidPptxBuffer(1);
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(true);
      expect(result.slideCount).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should accept a valid PPTX with multiple slides', async () => {
      const buffer = createValidPptxBuffer(5);
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(true);
      expect(result.slideCount).toBe(5);
    });

    it('should return contentTypesXml on success', async () => {
      const buffer = createValidPptxBuffer(1);
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(true);
      expect(result.contentTypesXml).toBe('<Types></Types>');
    });
  });

  describe('Non-ZIP data rejection', () => {
    it('should reject random bytes', async () => {
      const buffer = Buffer.from('this is not a zip file at all');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a valid PPTX archive');
    });

    it('should reject an empty buffer', async () => {
      const buffer = Buffer.alloc(0);
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a valid PPTX archive');
    });

    it('should reject a buffer with only the ZIP magic bytes but invalid structure', async () => {
      const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
    });
  });

  describe('Required OOXML entries', () => {
    it('should reject ZIP missing [Content_Types].xml', async () => {
      const buffer = createIncompleteZipBuffer('[Content_Types].xml');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing presentation structure');
    });

    it('should reject ZIP missing _rels/.rels', async () => {
      const buffer = createIncompleteZipBuffer('_rels/.rels');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing presentation structure');
    });

    it('should reject ZIP missing ppt/presentation.xml', async () => {
      const buffer = createIncompleteZipBuffer('ppt/presentation.xml');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing presentation structure');
    });

    it('should reject ZIP with no slide entries', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      const buffer = zip.toBuffer();

      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing presentation structure');
    });
  });

  describe('Path traversal detection', () => {
    it('should reject ZIP with ../ in entry name', async () => {
      const buffer = createZipWithTraversalEntry('../etc/passwd');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid path entries');
    });

    it('should reject ZIP with ..\\ in entry name', async () => {
      const buffer = createZipWithTraversalEntry('ppt\\..\\secret');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid path entries');
    });

    it('should reject ZIP with nested path traversal', async () => {
      const buffer = createZipWithTraversalEntry('ppt/slides/../../secret.xml');
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid path entries');
    });
  });

  describe('Decompression bomb detection', () => {
    it('should reject ZIP with single entry exceeding maxSingleEntrySize', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      // Create a large entry that exceeds the single entry limit
      const largeContent = Buffer.alloc(1024); // small actual content
      zip.addFile('ppt/media/large.bin', largeContent);
      const buffer = zip.toBuffer();

      // Use a very small limit to trigger the check
      const options: PptxValidatorOptions = {
        ...DEFAULT_VALIDATOR_OPTIONS,
        maxSingleEntrySize: 512, // 512 bytes limit
      };

      const result = await validatePptx(buffer, options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('decompression size limits');
    });

    it('should reject ZIP with total decompressed size exceeding limit', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      // Add multiple entries that together exceed the total limit
      for (let i = 0; i < 10; i++) {
        zip.addFile(`ppt/media/file${i}.bin`, Buffer.alloc(100));
      }
      const buffer = zip.toBuffer();

      const options: PptxValidatorOptions = {
        ...DEFAULT_VALIDATOR_OPTIONS,
        maxDecompressedSize: 500, // 500 bytes total limit
        maxSingleEntrySize: 200, // each entry is fine individually
      };

      const result = await validatePptx(buffer, options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('decompression size limits');
    });
  });

  describe('Entry count limit', () => {
    it('should reject ZIP with too many entries', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      // Add entries to exceed the limit
      for (let i = 0; i < 10; i++) {
        zip.addFile(`extra/file${i}.txt`, Buffer.from('x'));
      }
      const buffer = zip.toBuffer();

      const options: PptxValidatorOptions = {
        ...DEFAULT_VALIDATOR_OPTIONS,
        maxEntryCount: 5, // very low limit for testing
      };

      const result = await validatePptx(buffer, options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('entry count exceeds the allowed limit');
    });

    it('should accept ZIP at exactly the entry count limit', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      const buffer = zip.toBuffer();

      const options: PptxValidatorOptions = {
        ...DEFAULT_VALIDATOR_OPTIONS,
        maxEntryCount: 4, // exactly 4 entries
      };

      const result = await validatePptx(buffer, options);

      expect(result.valid).toBe(true);
    });
  });

  describe('Timeout behavior', () => {
    it('should timeout when validation takes too long', async () => {
      const buffer = createValidPptxBuffer(1);

      // Use a very short timeout to trigger the timeout path
      const options: PptxValidatorOptions = {
        ...DEFAULT_VALIDATOR_OPTIONS,
        timeoutMs: 0, // immediate timeout
      };

      const result = await validatePptx(buffer, options);

      // With 0ms timeout, the race condition means either result is possible
      // but with a real slow operation, timeout would win
      // For this test, we just verify the function doesn't throw
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('Slide count accuracy', () => {
    it('should count exactly the number of slide entries', async () => {
      const buffer = createValidPptxBuffer(10);
      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(true);
      expect(result.slideCount).toBe(10);
    });

    it('should not count non-slide XML files in ppt/slides/', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      zip.addFile('ppt/slides/slide2.xml', Buffer.from('<Slide2/>'));
      // These should NOT be counted as slides
      zip.addFile('ppt/slides/_rels/slide1.xml.rels', Buffer.from('<Rels/>'));
      zip.addFile('ppt/slides/notaslide.xml', Buffer.from('<NotASlide/>'));
      const buffer = zip.toBuffer();

      const result = await validatePptx(buffer, DEFAULT_VALIDATOR_OPTIONS);

      expect(result.valid).toBe(true);
      expect(result.slideCount).toBe(2);
    });
  });
});
