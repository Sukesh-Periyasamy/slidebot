import AdmZip from 'adm-zip';

export interface PptxMetadata {
  title: string;
  author: string;
  subject: string;
  slideCount: number;
}

export interface MetadataExtractionOptions {
  /** Original filename (without extension) used as fallback title */
  filename: string;
  /** Uploading user's display name used as fallback author */
  userDisplayName: string;
}

const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide\d+\.xml$/;

/**
 * Extracts metadata from a PPTX buffer.
 *
 * Reads title, author, and subject from `docProps/core.xml`.
 * Counts slides by matching `ppt/slides/slide*.xml` entries.
 *
 * Falls back to filename as title and user display name as author
 * when properties are absent or empty. If metadata extraction fails
 * entirely (malformed ZIP or missing entries), returns defaults with
 * slideCount=1.
 */
export function extractPptxMetadata(
  buffer: Buffer,
  options: MetadataExtractionOptions,
): PptxMetadata {
  const { filename, userDisplayName } = options;

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Count slides
    const slideCount = entries.filter((entry) =>
      SLIDE_ENTRY_PATTERN.test(entry.entryName),
    ).length;

    // Extract core properties from docProps/core.xml
    const coreEntry = zip.getEntry('docProps/core.xml');
    if (!coreEntry) {
      return {
        title: filename,
        author: userDisplayName,
        subject: '',
        slideCount: slideCount || 1,
      };
    }

    const coreXml = coreEntry.getData().toString('utf-8');
    const { title, author, subject } = parseCoreXml(coreXml);

    return {
      title: title || filename,
      author: author || userDisplayName,
      subject: subject || '',
      slideCount: slideCount || 1,
    };
  } catch {
    // Malformed ZIP or any other error: fallback to defaults
    return {
      title: filename,
      author: userDisplayName,
      subject: '',
      slideCount: 1,
    };
  }
}

interface CoreProperties {
  title: string;
  author: string;
  subject: string;
}

/**
 * Parses `docProps/core.xml` content to extract title, author (dc:creator),
 * and subject. Uses simple regex-based extraction to avoid adding an XML
 * parser dependency on the server side.
 */
export function parseCoreXml(xml: string): CoreProperties {
  return {
    title: extractXmlTextContent(xml, 'dc:title'),
    author: extractXmlTextContent(xml, 'dc:creator'),
    subject: extractXmlTextContent(xml, 'dc:subject'),
  };
}

/**
 * Extracts the text content of a simple XML element by tag name.
 * Handles self-closing tags and empty elements gracefully.
 */
function extractXmlTextContent(xml: string, tagName: string): string {
  // Match <tagName>content</tagName> or <tagName ...>content</tagName>
  const regex = new RegExp(
    `<${escapeRegex(tagName)}[^>]*>([^<]*)</${escapeRegex(tagName)}>`,
  );
  const match = xml.match(regex);
  if (!match) {
    return '';
  }
  return match[1].trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
