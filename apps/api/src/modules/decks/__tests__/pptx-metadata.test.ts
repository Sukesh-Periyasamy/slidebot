/**
 * pptx-metadata.test.ts
 *
 * Unit tests for the PPTX metadata extraction module.
 * Tests extraction of title, author, subject from docProps/core.xml,
 * slide counting, and fallback behavior.
 */

import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';

import { extractPptxMetadata, parseCoreXml } from '../pptx-metadata';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  filename: 'my-presentation',
  userDisplayName: 'John Doe',
};

function createCoreXml(props: {
  title?: string;
  creator?: string;
  subject?: string;
}): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push(
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">',
  );
  if (props.title !== undefined) {
    parts.push(`  <dc:title>${props.title}</dc:title>`);
  }
  if (props.creator !== undefined) {
    parts.push(`  <dc:creator>${props.creator}</dc:creator>`);
  }
  if (props.subject !== undefined) {
    parts.push(`  <dc:subject>${props.subject}</dc:subject>`);
  }
  parts.push('</cp:coreProperties>');
  return parts.join('\n');
}

function createPptxBuffer(options?: {
  slideCount?: number;
  coreXml?: string | null;
}): Buffer {
  const { slideCount = 1, coreXml } = options ?? {};
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
  zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
  zip.addFile(
    'ppt/presentation.xml',
    Buffer.from('<Presentation></Presentation>'),
  );
  for (let i = 1; i <= slideCount; i++) {
    zip.addFile(`ppt/slides/slide${i}.xml`, Buffer.from(`<Slide${i}/>`));
  }
  if (coreXml !== null) {
    const xml =
      coreXml ??
      createCoreXml({
        title: 'Test Presentation',
        creator: 'Jane Smith',
        subject: 'Testing',
      });
    zip.addFile('docProps/core.xml', Buffer.from(xml));
  }
  return zip.toBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PPTX Metadata Extraction', () => {
  describe('extractPptxMetadata', () => {
    it('should extract title, author, and subject from core.xml', () => {
      const buffer = createPptxBuffer({
        coreXml: createCoreXml({
          title: 'My Deck',
          creator: 'Alice',
          subject: 'Demo',
        }),
      });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.title).toBe('My Deck');
      expect(result.author).toBe('Alice');
      expect(result.subject).toBe('Demo');
    });

    it('should count slides correctly', () => {
      const buffer = createPptxBuffer({ slideCount: 7 });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.slideCount).toBe(7);
    });

    it('should use filename as title when title is absent', () => {
      const buffer = createPptxBuffer({
        coreXml: createCoreXml({ creator: 'Bob' }),
      });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.title).toBe('my-presentation');
    });

    it('should use filename as title when title is empty', () => {
      const buffer = createPptxBuffer({
        coreXml: createCoreXml({ title: '', creator: 'Bob' }),
      });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.title).toBe('my-presentation');
    });

    it('should use filename as title when title is whitespace-only', () => {
      const buffer = createPptxBuffer({
        coreXml: createCoreXml({ title: '   ', creator: 'Bob' }),
      });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.title).toBe('my-presentation');
    });

    it('should use user display name as author when creator is absent', () => {
      const buffer = createPptxBuffer({
        coreXml: createCoreXml({ title: 'Deck' }),
      });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.author).toBe('John Doe');
    });

    it('should use user display name as author when creator is empty', () => {
      const buffer = createPptxBuffer({
        coreXml: createCoreXml({ title: 'Deck', creator: '' }),
      });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.author).toBe('John Doe');
    });

    it('should fallback to defaults when docProps/core.xml is missing', () => {
      const buffer = createPptxBuffer({ slideCount: 3, coreXml: null });

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.title).toBe('my-presentation');
      expect(result.author).toBe('John Doe');
      expect(result.subject).toBe('');
      expect(result.slideCount).toBe(3);
    });

    it('should fallback to defaults with slideCount=1 for malformed buffer', () => {
      const buffer = Buffer.from('not a zip file');

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.title).toBe('my-presentation');
      expect(result.author).toBe('John Doe');
      expect(result.subject).toBe('');
      expect(result.slideCount).toBe(1);
    });

    it('should fallback slideCount to 1 when no slides match the pattern', () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile(
        'ppt/presentation.xml',
        Buffer.from('<Presentation></Presentation>'),
      );
      // No slide entries matching the pattern
      zip.addFile(
        'docProps/core.xml',
        Buffer.from(createCoreXml({ title: 'No Slides' })),
      );
      const buffer = zip.toBuffer();

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.slideCount).toBe(1);
      expect(result.title).toBe('No Slides');
    });

    it('should not count non-standard slide entries', () => {
      const zip = new AdmZip();
      zip.addFile('[Content_Types].xml', Buffer.from('<Types></Types>'));
      zip.addFile('_rels/.rels', Buffer.from('<Relationships></Relationships>'));
      zip.addFile(
        'ppt/presentation.xml',
        Buffer.from('<Presentation></Presentation>'),
      );
      zip.addFile('ppt/slides/slide1.xml', Buffer.from('<Slide1/>'));
      zip.addFile('ppt/slides/slide2.xml', Buffer.from('<Slide2/>'));
      // These should NOT be counted
      zip.addFile(
        'ppt/slides/_rels/slide1.xml.rels',
        Buffer.from('<Rels/>'),
      );
      zip.addFile('ppt/slides/notaslide.xml', Buffer.from('<X/>'));
      zip.addFile(
        'docProps/core.xml',
        Buffer.from(createCoreXml({ title: 'Test' })),
      );
      const buffer = zip.toBuffer();

      const result = extractPptxMetadata(buffer, DEFAULT_OPTIONS);

      expect(result.slideCount).toBe(2);
    });
  });

  describe('parseCoreXml', () => {
    it('should parse all three properties', () => {
      const xml = createCoreXml({
        title: 'Hello World',
        creator: 'Author Name',
        subject: 'Subject Line',
      });

      const result = parseCoreXml(xml);

      expect(result.title).toBe('Hello World');
      expect(result.author).toBe('Author Name');
      expect(result.subject).toBe('Subject Line');
    });

    it('should return empty strings for missing elements', () => {
      const xml = createCoreXml({});

      const result = parseCoreXml(xml);

      expect(result.title).toBe('');
      expect(result.author).toBe('');
      expect(result.subject).toBe('');
    });

    it('should handle XML with extra attributes on elements', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title xml:lang="en">Attributed Title</dc:title>
  <dc:creator xml:lang="en">Attributed Author</dc:creator>
</cp:coreProperties>`;

      const result = parseCoreXml(xml);

      expect(result.title).toBe('Attributed Title');
      expect(result.author).toBe('Attributed Author');
    });

    it('should trim whitespace from extracted values', () => {
      const xml = createCoreXml({
        title: '  Spaced Title  ',
        creator: '  Spaced Author  ',
      });

      const result = parseCoreXml(xml);

      expect(result.title).toBe('Spaced Title');
      expect(result.author).toBe('Spaced Author');
    });

    it('should handle completely empty XML gracefully', () => {
      const result = parseCoreXml('');

      expect(result.title).toBe('');
      expect(result.author).toBe('');
      expect(result.subject).toBe('');
    });

    it('should handle malformed XML gracefully', () => {
      // Unclosed tags return empty since regex requires closing tag
      const result = parseCoreXml('<broken><dc:title>Oops');

      expect(result.title).toBe('');
      expect(result.author).toBe('');
      expect(result.subject).toBe('');
    });
  });
});
