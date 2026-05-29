import AdmZip from 'adm-zip';

export interface PptxValidatorOptions {
  maxFileSize: number; // bytes
  maxDecompressedSize: number; // bytes (total across all entries)
  maxSingleEntrySize: number; // bytes (single entry uncompressed)
  maxEntryCount: number; // max number of ZIP entries
  timeoutMs: number; // validation timeout in milliseconds
}

export interface PptxValidationResult {
  valid: boolean;
  error?: string;
  slideCount?: number;
  contentTypesXml?: string;
}

export const DEFAULT_VALIDATOR_OPTIONS: PptxValidatorOptions = {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxDecompressedSize: 500 * 1024 * 1024, // 500MB
  maxSingleEntrySize: 200 * 1024 * 1024, // 200MB
  maxEntryCount: 10_000,
  timeoutMs: 30_000, // 30 seconds
};

const REQUIRED_ENTRIES = [
  '[Content_Types].xml',
  '_rels/.rels',
  'ppt/presentation.xml',
];

const SLIDE_ENTRY_PATTERN = /^ppt\/slides\/slide\d+\.xml$/;

/**
 * Validates a buffer as a valid PPTX file.
 *
 * Checks:
 * - Valid ZIP structure
 * - No path traversal sequences in entry names
 * - Decompression bomb detection (total size and single entry size)
 * - Entry count limit
 * - Required OOXML entries present
 * - At least one slide entry exists
 * - 30-second timeout
 */
export async function validatePptx(
  buffer: Buffer,
  options: PptxValidatorOptions = DEFAULT_VALIDATOR_OPTIONS,
): Promise<PptxValidationResult> {
  return Promise.race([
    performValidation(buffer, options),
    createTimeout(options.timeoutMs),
  ]);
}

function createTimeout(timeoutMs: number): Promise<PptxValidationResult> {
  return new Promise<PptxValidationResult>((resolve) => {
    setTimeout(() => {
      resolve({
        valid: false,
        error: 'File validation timed out. Please try a smaller file.',
      });
    }, timeoutMs);
  });
}

function performValidation(
  buffer: Buffer,
  options: PptxValidatorOptions,
): Promise<PptxValidationResult> {
  return new Promise<PptxValidationResult>((resolve) => {
    try {
      // Attempt to parse as ZIP
      let zip: AdmZip;
      try {
        zip = new AdmZip(buffer);
      } catch {
        resolve({
          valid: false,
          error: 'The file is not a valid PPTX archive.',
        });
        return;
      }

      const entries = zip.getEntries();

      // Check entry count limit
      if (entries.length > options.maxEntryCount) {
        resolve({
          valid: false,
          error: 'The archive entry count exceeds the allowed limit.',
        });
        return;
      }

      // Check for path traversal and decompression bomb
      let totalDecompressedSize = 0;
      const entryNames: string[] = [];

      for (const entry of entries) {
        const entryName = entry.entryName;

        // Path traversal detection
        if (hasPathTraversal(entryName)) {
          resolve({
            valid: false,
            error: 'The file contains invalid path entries.',
          });
          return;
        }

        // Single entry size check
        const uncompressedSize = entry.header.size;
        if (uncompressedSize > options.maxSingleEntrySize) {
          resolve({
            valid: false,
            error: 'The file exceeds decompression size limits.',
          });
          return;
        }

        totalDecompressedSize += uncompressedSize;

        // Total decompressed size check
        if (totalDecompressedSize > options.maxDecompressedSize) {
          resolve({
            valid: false,
            error: 'The file exceeds decompression size limits.',
          });
          return;
        }

        entryNames.push(entryName);
      }

      // Check for required OOXML entries
      for (const required of REQUIRED_ENTRIES) {
        if (!entryNames.includes(required)) {
          resolve({
            valid: false,
            error: 'The file is not a valid PPTX document. Missing presentation structure.',
          });
          return;
        }
      }

      // Check for at least one slide entry
      const slideEntries = entryNames.filter((name) => SLIDE_ENTRY_PATTERN.test(name));
      if (slideEntries.length === 0) {
        resolve({
          valid: false,
          error: 'The file is not a valid PPTX document. Missing presentation structure.',
        });
        return;
      }

      // Extract [Content_Types].xml content
      const contentTypesEntry = zip.getEntry('[Content_Types].xml');
      const contentTypesXml = contentTypesEntry
        ? contentTypesEntry.getData().toString('utf-8')
        : undefined;

      resolve({
        valid: true,
        slideCount: slideEntries.length,
        contentTypesXml,
      });
    } catch {
      resolve({
        valid: false,
        error: 'The file is not a valid PPTX archive.',
      });
    }
  });
}

/**
 * Detects path traversal sequences in a ZIP entry name.
 * Rejects entries containing `../`, `..\`, or absolute paths.
 */
function hasPathTraversal(entryName: string): boolean {
  if (entryName.includes('../') || entryName.includes('..\\')) {
    return true;
  }
  // Also check for entries that start with / or \ (absolute paths)
  if (entryName.startsWith('/') || entryName.startsWith('\\')) {
    return true;
  }
  return false;
}
