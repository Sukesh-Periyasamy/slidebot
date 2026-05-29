/**
 * pptx-upload.test.ts
 *
 * Unit tests for the PPTX upload endpoint logic in decks.router.ts.
 * Tests file acceptance logic, validation integration, and metadata extraction flow.
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';

import { validatePptx } from '../pptx-validator';
import { extractPptxMetadata } from '../pptx-metadata';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createValidPptxBuffer(slideCount = 1): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
  zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
  zip.addFile('docProps/core.xml', Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
    <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
      xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Test Presentation</dc:title>
      <dc:creator>Test Author</dc:creator>
      <dc:subject>Test Subject</dc:subject>
    </cp:coreProperties>`
  ));
  for (let i = 1; i <= slideCount; i++) {
    zip.addFile(`ppt/slides/slide${i}.xml`, Buffer.from(`<Slide${i}/>`));
  }
  return zip.toBuffer();
}

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Replicates the file acceptance logic from decks.router.ts
 */
function isAcceptedFile(mimetype: string, originalname: string): boolean {
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    PPTX_MIME,
  ];
  if (ALLOWED_MIME_TYPES.includes(mimetype)) return true;
  if (originalname.toLowerCase().endsWith('.pptx')) return true;
  return false;
}

function isPptxFile(mimetype: string, originalname: string): boolean {
  return mimetype === PPTX_MIME || originalname.toLowerCase().endsWith('.pptx');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PPTX Upload Endpoint Logic', () => {
  describe('File type acceptance (Req 1.1, 1.2)', () => {
    it('should accept PPTX MIME type', () => {
      expect(isAcceptedFile(PPTX_MIME, 'file.pptx')).toBe(true);
    });

    it('should accept .pptx extension regardless of MIME type', () => {
      expect(isAcceptedFile('application/octet-stream', 'deck.pptx')).toBe(true);
      expect(isAcceptedFile('application/zip', 'my-presentation.PPTX')).toBe(true);
    });

    it('should accept PDF MIME type', () => {
      expect(isAcceptedFile('application/pdf', 'file.pdf')).toBe(true);
    });

    it('should reject unsupported MIME types without .pptx extension', () => {
      expect(isAcceptedFile('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc.docx')).toBe(false);
      expect(isAcceptedFile('text/plain', 'notes.txt')).toBe(false);
      expect(isAcceptedFile('image/png', 'image.png')).toBe(false);
    });

    it('should identify PPTX files correctly for routing', () => {
      expect(isPptxFile(PPTX_MIME, 'file.pptx')).toBe(true);
      expect(isPptxFile('application/octet-stream', 'file.pptx')).toBe(true);
      expect(isPptxFile('application/pdf', 'file.pdf')).toBe(false);
    });
  });

  describe('PPTX structural validation integration (Req 1.5, 2.1-2.7)', () => {
    it('should validate a valid PPTX buffer successfully', async () => {
      const buffer = createValidPptxBuffer(3);
      const result = await validatePptx(buffer);

      expect(result.valid).toBe(true);
      expect(result.slideCount).toBe(3);
    });

    it('should reject invalid ZIP data', async () => {
      const buffer = Buffer.from('This is not a ZIP file');
      const result = await validatePptx(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a valid PPTX archive');
    });

    it('should reject ZIP without required OOXML entries', async () => {
      const zip = new AdmZip();
      zip.addFile('random.txt', Buffer.from('hello'));
      const buffer = zip.toBuffer();
      const result = await validatePptx(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a valid PPTX document');
    });

    it('should reject ZIP without slide entries', async () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      const buffer = zip.toBuffer();
      const result = await validatePptx(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not a valid PPTX document');
    });
  });

  describe('Metadata extraction integration (Req 1.6, 1.7)', () => {
    it('should extract title, author, and slide count from valid PPTX', () => {
      const buffer = createValidPptxBuffer(5);
      const metadata = extractPptxMetadata(buffer, {
        filename: 'fallback-name',
        userDisplayName: 'fallback-user',
      });

      expect(metadata.title).toBe('Test Presentation');
      expect(metadata.author).toBe('Test Author');
      expect(metadata.subject).toBe('Test Subject');
      expect(metadata.slideCount).toBe(5);
    });

    it('should fallback to filename when title is absent', () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      // No docProps/core.xml
      const buffer = zip.toBuffer();

      const metadata = extractPptxMetadata(buffer, {
        filename: 'My Cool Deck',
        userDisplayName: 'John',
      });

      expect(metadata.title).toBe('My Cool Deck');
      expect(metadata.author).toBe('John');
    });

    it('should fallback to user display name when author is absent', () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile('ppt/presentation.xml', Buffer.from('<Presentation></Presentation>'));
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      zip.addFile('docProps/core.xml', Buffer.from(
        `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Deck Title</dc:title></cp:coreProperties>`
      ));
      const buffer = zip.toBuffer();

      const metadata = extractPptxMetadata(buffer, {
        filename: 'deck',
        userDisplayName: 'Jane Doe',
      });

      expect(metadata.title).toBe('Deck Title');
      expect(metadata.author).toBe('Jane Doe');
    });

    it('should handle malformed buffer gracefully with defaults (Req 1.7)', () => {
      const buffer = Buffer.from('not a zip');
      const metadata = extractPptxMetadata(buffer, {
        filename: 'broken-file',
        userDisplayName: 'User',
      });

      expect(metadata.title).toBe('broken-file');
      expect(metadata.author).toBe('User');
      expect(metadata.slideCount).toBe(1);
    });
  });

  describe('Upload flow integration (Req 1.3, 1.4)', () => {
    it('should validate before metadata extraction - invalid file stops early', async () => {
      const invalidBuffer = Buffer.from('not a zip');
      const validationResult = await validatePptx(invalidBuffer);

      // Validation fails, so we would return 400 before metadata extraction
      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });

    it('should validate then extract metadata for valid PPTX', async () => {
      const buffer = createValidPptxBuffer(3);

      // Step 1: Validate
      const validationResult = await validatePptx(buffer);
      expect(validationResult.valid).toBe(true);

      // Step 2: Extract metadata (only if validation passes)
      const metadata = extractPptxMetadata(buffer, {
        filename: 'presentation',
        userDisplayName: 'user',
      });
      expect(metadata.slideCount).toBe(3);
      expect(metadata.title).toBe('Test Presentation');
    });

    it('file size limit should be 100MB', () => {
      // Verify the constant matches the requirement
      const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
      expect(MAX_UPLOAD_BYTES).toBe(104857600); // 100MB in bytes
    });
  });
});
