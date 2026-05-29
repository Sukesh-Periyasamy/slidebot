// ─────────────────────────────────────────────────────────────────────────────
// PPTX Parser Web Worker — Client-side PPTX parsing in a dedicated thread
// ─────────────────────────────────────────────────────────────────────────────

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { resolveSlideContext } from '../lib/ooxml-resolver';
import { extractShapes } from '../lib/shape-extractor';
import { normalize } from '@slidebot/shared-types/scene-graph-normalizer';
import type { PresentationDocument, Slide, BackgroundElement } from '@slidebot/shared-types/scene-graph';

// ─── Message Types ───────────────────────────────────────────────────────────

type PptxParserRequest =
  | { type: 'PARSE'; file: ArrayBuffer }
  | { type: 'CANCEL' };

type PptxParserResponse =
  | { type: 'PROGRESS'; stage: ParsingStage; percent: number }
  | { type: 'COMPLETE'; document: PresentationDocument }
  | { type: 'ERROR'; stage: ParsingStage; message: string };

type ParsingStage = 'zip-extraction' | 'xml-parsing' | 'scene-graph-construction';

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;
const DEFAULT_SLIDE_WIDTH = 9144000;  // 10 inches in EMU
const DEFAULT_SLIDE_HEIGHT = 6858000; // 7.5 inches in EMU

// ─── XML Parser Configuration ────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

// ─── State ───────────────────────────────────────────────────────────────────

let cancelled = false;
let timeoutId: ReturnType<typeof setTimeout> | null = null;
let activeStage: ParsingStage = 'zip-extraction';

// ─── Utility Functions ───────────────────────────────────────────────────────

function postProgress(stage: ParsingStage, percent: number): void {
  const msg: PptxParserResponse = {
    type: 'PROGRESS',
    stage,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
  };
  self.postMessage(msg);
}

function postComplete(document: PresentationDocument): void {
  const msg: PptxParserResponse = { type: 'COMPLETE', document };
  self.postMessage(msg);
}

function postError(stage: ParsingStage, message: string): void {
  const msg: PptxParserResponse = { type: 'ERROR', stage, message };
  self.postMessage(msg);
}

function cleanup(): void {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
}

/**
 * Parses docProps/core.xml content to extract title and author.
 */
function parseMetadataXml(xmlContent: string): { title: string; author: string } {
  try {
    const parsed = xmlParser.parse(xmlContent) as Record<string, unknown>;
    const coreProperties = (parsed['coreProperties'] ?? parsed['cp:coreProperties'] ?? parsed['Properties']) as Record<string, unknown> | undefined;

    if (!coreProperties || typeof coreProperties !== 'object') {
      return { title: '', author: '' };
    }

    // Title can be under dc:title or title
    let title = '';
    const titleVal = coreProperties['title'] ?? coreProperties['dc:title'];
    if (typeof titleVal === 'string') {
      title = titleVal;
    } else if (titleVal && typeof titleVal === 'object') {
      title = (titleVal as Record<string, unknown>)['#text'] as string ?? '';
    }

    // Author can be under dc:creator or creator
    let author = '';
    const authorVal = coreProperties['creator'] ?? coreProperties['dc:creator'];
    if (typeof authorVal === 'string') {
      author = authorVal;
    } else if (authorVal && typeof authorVal === 'object') {
      author = (authorVal as Record<string, unknown>)['#text'] as string ?? '';
    }

    return { title, author };
  } catch {
    return { title: '', author: '' };
  }
}

/**
 * Gets the slide dimensions from ppt/presentation.xml
 */
function parseSlideDimensions(presentationXml: string): { width: number; height: number } {
  try {
    const parsed = xmlParser.parse(presentationXml) as Record<string, unknown>;
    const presentation = parsed['presentation'] as Record<string, unknown> | undefined;
    if (!presentation) return { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

    const sldSz = presentation['sldSz'] as Record<string, unknown> | undefined;
    if (!sldSz) return { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };

    const cx = sldSz['@_cx'];
    const cy = sldSz['@_cy'];

    const width = typeof cx === 'string' ? parseInt(cx, 10) : (typeof cx === 'number' ? cx : DEFAULT_SLIDE_WIDTH);
    const height = typeof cy === 'string' ? parseInt(cy, 10) : (typeof cy === 'number' ? cy : DEFAULT_SLIDE_HEIGHT);

    return {
      width: isNaN(width) || width <= 0 ? DEFAULT_SLIDE_WIDTH : width,
      height: isNaN(height) || height <= 0 ? DEFAULT_SLIDE_HEIGHT : height,
    };
  } catch {
    return { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
  }
}

/**
 * Resolves relationships from a _rels file for a given slide.
 */
function parseRelationships(relsXml: string): Record<string, string> {
  try {
    const parsed = xmlParser.parse(relsXml) as Record<string, unknown>;
    const relationships = parsed['Relationships'] as Record<string, unknown> | undefined;
    if (!relationships) return {};

    const relElements = relationships['Relationship'];
    if (!relElements) return {};

    const rels: Record<string, string> = {};
    const relArray = Array.isArray(relElements) ? relElements : [relElements];

    for (const rel of relArray) {
      if (!rel || typeof rel !== 'object') continue;
      const relObj = rel as Record<string, unknown>;
      const id = relObj['@_Id'];
      const target = relObj['@_Target'];
      if (typeof id === 'string' && typeof target === 'string') {
        rels[id] = target;
      }
    }

    return rels;
  } catch {
    return {};
  }
}

/**
 * Gets slide file names sorted numerically.
 */
function getSlideFiles(zip: JSZip): string[] {
  const slidePattern = /^ppt\/slides\/slide(\d+)\.xml$/;
  const slides: { path: string; num: number }[] = [];

  zip.forEach((relativePath) => {
    const match = relativePath.match(slidePattern);
    if (match && match[1]) {
      slides.push({ path: relativePath, num: parseInt(match[1], 10) });
    }
  });

  slides.sort((a, b) => a.num - b.num);
  return slides.map(s => s.path);
}

// ─── Main Parse Function ─────────────────────────────────────────────────────

async function parsePptx(fileBuffer: ArrayBuffer): Promise<void> {
  let currentStage: ParsingStage = 'zip-extraction';

  try {
    // ─── Stage 1: ZIP Extraction ───────────────────────────────────────
    postProgress('zip-extraction', 0);
    currentStage = 'zip-extraction';
    activeStage = 'zip-extraction';

    if (cancelled) return;

    const zip = await JSZip.loadAsync(fileBuffer);

    postProgress('zip-extraction', 100);

    if (cancelled) return;

    // ─── Stage 2: XML Parsing ──────────────────────────────────────────
    postProgress('xml-parsing', 0);
    currentStage = 'xml-parsing';
    activeStage = 'xml-parsing';

    // Get slide files
    const slideFiles = getSlideFiles(zip);
    if (slideFiles.length === 0) {
      postError('xml-parsing', 'No slide files found in the PPTX archive');
      return;
    }

    // Parse presentation.xml for slide dimensions
    const presentationFile = zip.file('ppt/presentation.xml');
    let slideWidth = DEFAULT_SLIDE_WIDTH;
    let slideHeight = DEFAULT_SLIDE_HEIGHT;
    if (presentationFile) {
      const presentationXml = await presentationFile.async('string');
      const dims = parseSlideDimensions(presentationXml);
      slideWidth = dims.width;
      slideHeight = dims.height;
    }

    if (cancelled) return;

    // Parse metadata from docProps/core.xml
    let metadataTitle = '';
    let metadataAuthor = '';
    const coreXmlFile = zip.file('docProps/core.xml');
    if (coreXmlFile) {
      const coreXmlContent = await coreXmlFile.async('string');
      const metadata = parseMetadataXml(coreXmlContent);
      metadataTitle = metadata.title;
      metadataAuthor = metadata.author;
    }

    if (cancelled) return;

    // Load theme XML (default to theme1.xml)
    let themeXml = '';
    const themeFile = zip.file('ppt/theme/theme1.xml');
    if (themeFile) {
      themeXml = await themeFile.async('string');
    }

    // Load slide master XML (default to slideMaster1.xml)
    let masterXml = '';
    const masterFile = zip.file('ppt/slideMasters/slideMaster1.xml');
    if (masterFile) {
      masterXml = await masterFile.async('string');
    }

    // Load slide layout XML (default to slideLayout1.xml)
    let layoutXml = '';
    const layoutFile = zip.file('ppt/slideLayouts/slideLayout1.xml');
    if (layoutFile) {
      layoutXml = await layoutFile.async('string');
    }

    if (cancelled) return;

    // Resolve slide context (theme, master, layout inheritance)
    const slideContext = resolveSlideContext(
      themeXml || '<theme/>',
      masterXml || '<sldMaster/>',
      layoutXml || '<sldLayout/>'
    );

    // Parse all slide XML files
    const slideXmlContents: string[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      if (cancelled) return;

      const slidePath = slideFiles[i];
      if (slidePath) {
        const slideFile = zip.file(slidePath);
        if (slideFile) {
          const content = await slideFile.async('string');
          slideXmlContents.push(content);
        }
      }

      // Report progress within xml-parsing stage
      const percent = Math.round(((i + 1) / slideFiles.length) * 100);
      postProgress('xml-parsing', percent);
    }

    if (cancelled) return;

    // ─── Stage 3: Scene Graph Construction ─────────────────────────────
    postProgress('scene-graph-construction', 0);
    currentStage = 'scene-graph-construction';
    activeStage = 'scene-graph-construction';

    const slides: Slide[] = [];

    for (let i = 0; i < slideXmlContents.length; i++) {
      if (cancelled) return;

      const slideXml = slideXmlContents[i];
      if (!slideXml) continue;

      // Load slide relationships
      const slideNum = i + 1;
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      let relationships: Record<string, string> = {};
      const relsFile = zip.file(relsPath);
      if (relsFile) {
        const relsContent = await relsFile.async('string');
        relationships = parseRelationships(relsContent);
      }

      // Resolve image relationships to base64 data URIs
      const resolvedRelationships: Record<string, string> = {};
      for (const [rId, target] of Object.entries(relationships)) {
        // Resolve relative paths from ppt/slides/ directory
        const resolvedPath = target.startsWith('../')
          ? `ppt/${target.slice(3)}`
          : target.startsWith('/')
            ? target.slice(1)
            : `ppt/slides/${target}`;

        // Check if it's an image file and resolve to data URI
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.svg', '.emf', '.wmf'];
        const isImage = imageExtensions.some(ext => resolvedPath.toLowerCase().endsWith(ext));

        if (isImage) {
          const imageFile = zip.file(resolvedPath);
          if (imageFile) {
            const imageData = await imageFile.async('base64');
            const ext = resolvedPath.split('.').pop()?.toLowerCase() ?? 'png';
            const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
              : ext === 'svg' ? 'image/svg+xml'
              : `image/${ext}`;
            resolvedRelationships[rId] = `data:${mimeType};base64,${imageData}`;
          } else {
            resolvedRelationships[rId] = target;
          }
        } else {
          resolvedRelationships[rId] = target;
        }
      }

      // Extract shapes from slide XML
      const extractedShapes = extractShapes(slideXml, resolvedRelationships, slideContext);

      // Separate background from regular shapes
      let background: BackgroundElement | undefined;
      const nonBackgroundShapes = extractedShapes.filter(shape => {
        if (shape.type === 'background') {
          background = shape.properties as unknown as BackgroundElement;
          return false;
        }
        return true;
      });

      // Normalize shapes to virtual viewport coordinates
      const elements = normalize(nonBackgroundShapes, slideWidth, slideHeight);

      const slide: Slide = { elements };
      if (background) {
        slide.background = background;
      }
      slides.push(slide);

      // Report progress within scene-graph-construction stage
      const percent = Math.round(((i + 1) / slideXmlContents.length) * 100);
      postProgress('scene-graph-construction', percent);
    }

    if (cancelled) return;

    // Build the final PresentationDocument
    const document: PresentationDocument = {
      slides,
      metadata: {
        title: metadataTitle,
        author: metadataAuthor,
        slideCount: slides.length,
        sourceWidth: slideWidth,
        sourceHeight: slideHeight,
      },
    };

    // Post the completed document
    postComplete(document);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postError(currentStage, message);
  } finally {
    cleanup();
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<PptxParserRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'PARSE': {
      cancelled = false;

      // Set up 30-second timeout
      timeoutId = setTimeout(() => {
        cancelled = true;
        postError(activeStage, 'Parsing timed out after 30 seconds');
        cleanup();
      }, TIMEOUT_MS);

      parsePptx(request.file).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        postError('zip-extraction', message);
        cleanup();
      });
      break;
    }

    case 'CANCEL': {
      cancelled = true;
      cleanup();
      break;
    }
  }
};
