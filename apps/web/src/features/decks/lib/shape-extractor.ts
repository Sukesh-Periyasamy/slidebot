// ─────────────────────────────────────────────────────────────────────────────
// Shape Extractor — Extracts visual elements from parsed OOXML slide XML
// ─────────────────────────────────────────────────────────────────────────────

import { XMLParser } from 'fast-xml-parser';
import type { ExtractedShape } from '@slidebot/shared-types/scene-graph-normalizer';
import type { BackgroundElement, Paragraph, TextRun } from '@slidebot/shared-types/scene-graph';
import type { ResolvedSlideContext } from './ooxml-resolver';
import { resolveSchemeColor, resolveFontReference, mergeShapeDefaults } from './ooxml-resolver';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Parsed XML object from fast-xml-parser */
export type ParsedXml = Record<string, unknown>;

/** Relationship map: rId → target path or base64 data */
export type Relationships = Record<string, string>;

// ─── XML Parser Configuration ────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Safely navigates a nested object by a path of keys.
 */
function getNestedValue(obj: unknown, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Ensures a value is an array. If it's a single item, wraps it.
 */
function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parses an integer from a string or number value.
 */
function parseIntSafe(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Extracts position (x, y, width, height) from shape transform elements.
 * OOXML uses `off` for offset (x, y) and `ext` for extent (cx, cy).
 */
function extractPosition(spPr: Record<string, unknown>): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xfrm = spPr.xfrm as Record<string, unknown> | undefined;
  if (!xfrm) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const off = xfrm.off as Record<string, unknown> | undefined;
  const ext = xfrm.ext as Record<string, unknown> | undefined;

  return {
    x: parseIntSafe(off?.['@_x']),
    y: parseIntSafe(off?.['@_y']),
    width: parseIntSafe(ext?.['@_cx']),
    height: parseIntSafe(ext?.['@_cy']),
  };
}

// ─── Color Resolution ────────────────────────────────────────────────────────

/**
 * Resolves a color element to a #RRGGBB string.
 * Handles srgbClr, schemeClr, and sysClr elements.
 */
function resolveColor(
  colorElement: unknown,
  context: ResolvedSlideContext
): string | undefined {
  if (!colorElement || typeof colorElement !== 'object') return undefined;
  const el = colorElement as Record<string, unknown>;

  // Direct sRGB color
  if (el.srgbClr) {
    const srgb = el.srgbClr as Record<string, unknown>;
    const val = srgb['@_val'];
    if (typeof val === 'string' && /^[0-9A-Fa-f]{6}$/.test(val)) {
      return `#${val.toUpperCase()}`;
    }
  }

  // Scheme color reference
  if (el.schemeClr) {
    const scheme = el.schemeClr as Record<string, unknown>;
    const val = scheme['@_val'];
    if (typeof val === 'string') {
      return resolveSchemeColor(val, context) ?? undefined;
    }
  }

  // System color
  if (el.sysClr) {
    const sys = el.sysClr as Record<string, unknown>;
    const lastClr = sys['@_lastClr'];
    if (typeof lastClr === 'string' && /^[0-9A-Fa-f]{6}$/.test(lastClr)) {
      return `#${lastClr.toUpperCase()}`;
    }
  }

  return undefined;
}

/**
 * Extracts fill color from a solidFill element.
 */
function extractSolidFillColor(
  solidFill: unknown,
  context: ResolvedSlideContext
): string | undefined {
  if (!solidFill || typeof solidFill !== 'object') return undefined;
  return resolveColor(solidFill, context);
}

// ─── Text Extraction ─────────────────────────────────────────────────────────

/**
 * Extracts text runs from a paragraph's run elements.
 */
function extractTextRuns(
  paragraph: Record<string, unknown>,
  context: ResolvedSlideContext,
  defaults: { fontFamily: string; fontSize: number; color: string }
): TextRun[] {
  const runs: TextRun[] = [];
  const rElements = ensureArray(paragraph.r as Record<string, unknown> | Record<string, unknown>[]);

  for (const r of rElements) {
    if (!r || typeof r !== 'object') continue;
    const rObj = r as Record<string, unknown>;

    const text = typeof rObj.t === 'string' ? rObj.t :
                 (typeof rObj.t === 'object' && rObj.t !== null)
                   ? ((rObj.t as Record<string, unknown>)['#text'] as string ?? '')
                   : String(rObj.t ?? '');

    if (!text) continue;

    const rPr = rObj.rPr as Record<string, unknown> | undefined;
    const run: TextRun = { text };

    if (rPr) {
      // Font family
      const latin = rPr.latin as Record<string, unknown> | undefined;
      if (latin) {
        const typeface = latin['@_typeface'];
        if (typeof typeface === 'string' && typeface.length > 0) {
          run.fontFamily = typeface.startsWith('+')
            ? resolveFontReference(typeface, context)
            : typeface;
        }
      }
      if (!run.fontFamily) run.fontFamily = defaults.fontFamily;

      // Font size (hundredths of a point → points)
      const sz = rPr['@_sz'];
      if (sz !== undefined) {
        run.fontSize = parseIntSafe(sz) / 100;
      } else {
        run.fontSize = defaults.fontSize;
      }

      // Bold
      const b = rPr['@_b'];
      run.bold = b === '1' || b === 'true' || b === true;

      // Italic
      const i = rPr['@_i'];
      run.italic = i === '1' || i === 'true' || i === true;

      // Color
      const solidFill = rPr.solidFill;
      if (solidFill) {
        run.color = extractSolidFillColor(solidFill, context) ?? defaults.color;
      } else {
        run.color = defaults.color;
      }
    } else {
      run.fontFamily = defaults.fontFamily;
      run.fontSize = defaults.fontSize;
      run.color = defaults.color;
    }

    runs.push(run);
  }

  return runs;
}

/**
 * Resolves paragraph alignment from OOXML alignment attribute.
 */
function resolveAlignment(algn: unknown): 'left' | 'center' | 'right' | 'justify' {
  switch (algn) {
    case 'ctr': return 'center';
    case 'r': return 'right';
    case 'just': return 'justify';
    case 'l':
    default: return 'left';
  }
}

/**
 * Extracts paragraphs from a text body element.
 */
function extractParagraphs(
  txBody: Record<string, unknown>,
  context: ResolvedSlideContext,
  defaults: { fontFamily: string; fontSize: number; color: string }
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const pElements = ensureArray(txBody.p as Record<string, unknown> | Record<string, unknown>[]);

  for (const p of pElements) {
    if (!p || typeof p !== 'object') continue;
    const pObj = p as Record<string, unknown>;

    // Paragraph properties
    const pPr = pObj.pPr as Record<string, unknown> | undefined;
    const alignment = resolveAlignment(pPr?.['@_algn']);

    const runs = extractTextRuns(pObj, context, defaults);

    paragraphs.push({ runs, alignment });
  }

  return paragraphs;
}

/**
 * Extracts a text shape from a shape element containing a text body.
 */
function extractTextShape(
  sp: Record<string, unknown>,
  context: ResolvedSlideContext,
  zIndex: number
): ExtractedShape | null {
  const spPr = sp.spPr as Record<string, unknown> | undefined;
  const txBody = sp.txBody as Record<string, unknown> | undefined;

  if (!txBody) return null;

  const position = extractPosition(spPr ?? {});
  const shapeDefaults = mergeShapeDefaults(context);

  const defaults = {
    fontFamily: shapeDefaults.fontFamily ?? context.theme.minorFont ?? 'Calibri',
    fontSize: shapeDefaults.fontSize ?? 18,
    color: shapeDefaults.fontColor ?? '#000000',
  };

  const paragraphs = extractParagraphs(txBody, context, defaults);

  // Build content string from all paragraphs
  const content = paragraphs
    .map(p => p.runs.map(r => r.text).join(''))
    .join('\n');

  // Determine overall properties from first run
  const firstRun = paragraphs[0]?.runs[0];
  const overallAlignment = paragraphs[0]?.alignment ?? 'left';

  return {
    type: 'text',
    position,
    zIndex,
    properties: {
      content,
      fontFamily: firstRun?.fontFamily ?? defaults.fontFamily,
      fontSize: firstRun?.fontSize ?? defaults.fontSize,
      fontWeight: firstRun?.bold ? 'bold' : 'normal',
      fontStyle: firstRun?.italic ? 'italic' : 'normal',
      color: firstRun?.color ?? defaults.color,
      alignment: overallAlignment,
      paragraphs,
    },
  };
}

// ─── Geometry Shape Extraction ───────────────────────────────────────────────

/**
 * Maps OOXML preset geometry names to simplified shape type names.
 */
function resolveShapeType(prstGeom: unknown): string {
  if (!prstGeom || typeof prstGeom !== 'object') return 'rect';
  const geom = prstGeom as Record<string, unknown>;
  const prst = geom['@_prst'];
  if (typeof prst === 'string') return prst;
  return 'rect';
}

/**
 * Extracts outline properties from a line element.
 */
function extractOutline(
  ln: unknown,
  context: ResolvedSlideContext
): { outlineColor?: string; outlineWidth?: number } {
  if (!ln || typeof ln !== 'object') return {};
  const line = ln as Record<string, unknown>;

  const result: { outlineColor?: string; outlineWidth?: number } = {};

  // Width in EMU (convert to points: 1 pt = 12700 EMU)
  const w = line['@_w'];
  if (w !== undefined) {
    result.outlineWidth = parseIntSafe(w) / 12700;
  }

  // Outline color from solidFill
  const solidFill = line.solidFill;
  if (solidFill) {
    const color = extractSolidFillColor(solidFill, context);
    if (color) {
      result.outlineColor = color;
    }
  }

  return result;
}

/**
 * Extracts a geometric shape from a shape element.
 */
function extractGeometryShape(
  sp: Record<string, unknown>,
  context: ResolvedSlideContext,
  zIndex: number
): ExtractedShape {
  const spPr = sp.spPr as Record<string, unknown> | undefined ?? {};
  const position = extractPosition(spPr);

  const shapeType = resolveShapeType(spPr.prstGeom);
  const fillColor = extractSolidFillColor(spPr.solidFill, context);
  const outline = extractOutline(spPr.ln, context);

  return {
    type: 'geometry',
    position,
    zIndex,
    properties: {
      shapeType,
      fillColor,
      ...outline,
    },
  };
}

// ─── Image Extraction ────────────────────────────────────────────────────────

/**
 * Determines content type from a file extension.
 */
function contentTypeFromExtension(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'bmp': return 'image/bmp';
    case 'tiff':
    case 'tif': return 'image/tiff';
    case 'webp': return 'image/webp';
    case 'emf': return 'image/x-emf';
    case 'wmf': return 'image/x-wmf';
    default: return 'application/octet-stream';
  }
}

/**
 * Extracts an image shape from a picture element.
 */
function extractImageShape(
  pic: Record<string, unknown>,
  relationships: Relationships,
  context: ResolvedSlideContext,
  zIndex: number
): ExtractedShape | null {
  // Get blip fill reference
  const blipFill = pic.blipFill as Record<string, unknown> | undefined;
  if (!blipFill) return null;

  const blip = blipFill.blip as Record<string, unknown> | undefined;
  if (!blip) return null;

  // Resolve relationship ID to get image data
  const rEmbed = blip['@_embed'] ?? blip['@_r:embed'];
  const rId = typeof rEmbed === 'string' ? rEmbed : undefined;

  let dataUri = '';
  let contentType = 'image/png';

  if (rId && relationships[rId]) {
    const target = relationships[rId];
    // If the relationship value is already a data URI, use it directly
    if (target.startsWith('data:')) {
      dataUri = target;
      const match = target.match(/^data:([^;]+)/);
      if (match) contentType = match[1] ?? 'image/png';
    } else {
      // It's a path reference — the caller should have resolved it to base64
      contentType = contentTypeFromExtension(target);
      dataUri = target;
    }
  }

  // Get position from spPr
  const spPr = pic.spPr as Record<string, unknown> | undefined ?? {};
  const position = extractPosition(spPr);

  // Alt text from nvPicPr
  const nvPicPr = pic.nvPicPr as Record<string, unknown> | undefined;
  const cNvPr = nvPicPr?.cNvPr as Record<string, unknown> | undefined;
  const altText = typeof cNvPr?.['@_descr'] === 'string'
    ? cNvPr['@_descr']
    : '';

  return {
    type: 'image',
    position,
    zIndex,
    properties: {
      dataUri,
      contentType,
      altText,
    },
  };
}

// ─── Table Extraction ────────────────────────────────────────────────────────

/**
 * Extracts table content from a graphicFrame element containing a table.
 */
function extractTableShape(
  graphicFrame: Record<string, unknown>,
  context: ResolvedSlideContext,
  zIndex: number
): ExtractedShape | null {
  // Navigate to the table element
  const graphic = graphicFrame.graphic as Record<string, unknown> | undefined;
  if (!graphic) return null;

  const graphicData = graphic.graphicData as Record<string, unknown> | undefined;
  if (!graphicData) return null;

  const tbl = graphicData.tbl as Record<string, unknown> | undefined;
  if (!tbl) return null;

  // Get position from xfrm
  const xfrm = graphicFrame.xfrm as Record<string, unknown> | undefined;
  const position = xfrm
    ? extractPosition({ xfrm })
    : { x: 0, y: 0, width: 0, height: 0 };

  // Extract table grid to determine column count
  const tblGrid = tbl.tblGrid as Record<string, unknown> | undefined;
  const gridCols = ensureArray(tblGrid?.gridCol as Record<string, unknown>[] | undefined);
  const columns = gridCols.length;

  // Extract rows
  const trElements = ensureArray(tbl.tr as Record<string, unknown>[] | undefined);
  const rows = trElements.length;

  const cells: Array<Array<{ content: string; rowSpan: number; colSpan: number }>> = [];
  const merges: Array<{ startRow: number; startCol: number; rowSpan: number; colSpan: number }> = [];

  for (let rowIdx = 0; rowIdx < trElements.length; rowIdx++) {
    const tr = trElements[rowIdx];
    if (!tr || typeof tr !== 'object') {
      cells.push([]);
      continue;
    }

    const tcElements = ensureArray(
      (tr as Record<string, unknown>).tc as Record<string, unknown>[] | undefined
    );
    const rowCells: Array<{ content: string; rowSpan: number; colSpan: number }> = [];

    for (let colIdx = 0; colIdx < tcElements.length; colIdx++) {
      const tc = tcElements[colIdx];
      if (!tc || typeof tc !== 'object') {
        rowCells.push({ content: '', rowSpan: 1, colSpan: 1 });
        continue;
      }

      const tcObj = tc as Record<string, unknown>;

      // Extract cell text content
      const txBody = tcObj.txBody as Record<string, unknown> | undefined;
      let content = '';
      if (txBody) {
        const pElements = ensureArray(txBody.p as Record<string, unknown>[] | undefined);
        content = pElements
          .map(p => {
            const rElements = ensureArray(
              (p as Record<string, unknown>).r as Record<string, unknown>[] | undefined
            );
            return rElements
              .map(r => {
                const rObj = r as Record<string, unknown>;
                if (typeof rObj.t === 'string') return rObj.t;
                if (typeof rObj.t === 'object' && rObj.t !== null) {
                  return ((rObj.t as Record<string, unknown>)['#text'] as string) ?? '';
                }
                return String(rObj.t ?? '');
              })
              .join('');
          })
          .join('\n');
      }

      // Extract merge info
      const tcPr = tcObj.tcPr as Record<string, unknown> | undefined;
      const rowSpan = parseIntSafe(tcPr?.['@_rowSpan'] ?? tcObj['@_rowSpan']) || 1;
      const gridSpan = parseIntSafe(tcPr?.['@_gridSpan'] ?? tcObj['@_gridSpan']) || 1;

      rowCells.push({ content, rowSpan, colSpan: gridSpan });

      // Track merges
      if (rowSpan > 1 || gridSpan > 1) {
        merges.push({
          startRow: rowIdx,
          startCol: colIdx,
          rowSpan,
          colSpan: gridSpan,
        });
      }
    }

    cells.push(rowCells);
  }

  return {
    type: 'table',
    position,
    zIndex,
    properties: {
      rows,
      columns,
      cells,
      merges,
    },
  };
}

// ─── Background Extraction ───────────────────────────────────────────────────

/**
 * Extracts slide background properties.
 */
function extractBackground(
  bg: Record<string, unknown>,
  relationships: Relationships,
  context: ResolvedSlideContext
): BackgroundElement | null {
  const bgPr = bg.bgPr as Record<string, unknown> | undefined;
  if (!bgPr) {
    // Try bgRef (background reference from theme)
    const bgRef = bg.bgRef as Record<string, unknown> | undefined;
    if (bgRef) {
      const color = resolveColor(bgRef, context);
      if (color) {
        return { type: 'solid', color };
      }
    }
    return null;
  }

  // Solid fill
  if (bgPr.solidFill) {
    const color = extractSolidFillColor(bgPr.solidFill, context);
    if (color) {
      return { type: 'solid', color };
    }
  }

  // Gradient fill
  if (bgPr.gradFill) {
    const gradFill = bgPr.gradFill as Record<string, unknown>;
    const gsLst = gradFill.gsLst as Record<string, unknown> | undefined;
    if (gsLst) {
      const gsElements = ensureArray(gsLst.gs as Record<string, unknown>[] | undefined);
      const gradientStops = gsElements
        .map(gs => {
          const pos = parseIntSafe(gs['@_pos']);
          const offset = pos / 100000; // OOXML uses 0-100000 scale
          const color = resolveColor(gs, context);
          return color ? { offset, color } : null;
        })
        .filter((stop): stop is { offset: number; color: string } => stop !== null);

      if (gradientStops.length > 0) {
        return { type: 'gradient', gradientStops };
      }
    }
  }

  // Background image (blipFill)
  if (bgPr.blipFill) {
    const blipFill = bgPr.blipFill as Record<string, unknown>;
    const blip = blipFill.blip as Record<string, unknown> | undefined;
    if (blip) {
      const rEmbed = blip['@_embed'] ?? blip['@_r:embed'];
      const rId = typeof rEmbed === 'string' ? rEmbed : undefined;
      if (rId && relationships[rId]) {
        return { type: 'image', imageDataUri: relationships[rId] };
      }
    }
  }

  return null;
}

// ─── Shape Classification ────────────────────────────────────────────────────

/**
 * Determines if a shape element is primarily a text shape or a geometry shape.
 * A shape with a text body containing actual text content is treated as text.
 * A shape without text (or with empty text) is treated as geometry.
 */
function isTextShape(sp: Record<string, unknown>): boolean {
  const txBody = sp.txBody as Record<string, unknown> | undefined;
  if (!txBody) return false;

  const pElements = ensureArray(txBody.p as Record<string, unknown>[] | undefined);
  for (const p of pElements) {
    if (!p || typeof p !== 'object') continue;
    const rElements = ensureArray(
      (p as Record<string, unknown>).r as Record<string, unknown>[] | undefined
    );
    for (const r of rElements) {
      if (!r || typeof r !== 'object') continue;
      const rObj = r as Record<string, unknown>;
      const text = typeof rObj.t === 'string' ? rObj.t :
                   (typeof rObj.t === 'object' && rObj.t !== null)
                     ? ((rObj.t as Record<string, unknown>)['#text'] as string ?? '')
                     : String(rObj.t ?? '');
      if (text.trim().length > 0) return true;
    }
  }

  return false;
}

/**
 * Determines if a graphicFrame contains a table.
 */
function isTableFrame(graphicFrame: Record<string, unknown>): boolean {
  const graphic = graphicFrame.graphic as Record<string, unknown> | undefined;
  if (!graphic) return false;
  const graphicData = graphic.graphicData as Record<string, unknown> | undefined;
  if (!graphicData) return false;
  return graphicData.tbl !== undefined;
}

// ─── Main Extraction Function ────────────────────────────────────────────────

/**
 * Extracts all visual shapes from a parsed slide XML document.
 *
 * Processes the slide's shape tree (spTree) and extracts:
 * - Text elements with font properties, alignment, and color
 * - Geometric shapes with fill, outline, and position
 * - Embedded images resolved from relationships
 * - Tables with cell content and merge information
 * - Slide background (solid, gradient, or image)
 *
 * Z-order is preserved from source XML ordering (first element = lowest z-index).
 *
 * @param slideXml - Parsed slide XML (from fast-xml-parser) or raw XML string
 * @param relationships - Map of relationship IDs to target paths/data URIs
 * @param context - Resolved slide context with theme, master, and layout defaults
 * @returns Array of extracted shapes in z-order
 */
export function extractShapes(
  slideXml: ParsedXml | string,
  relationships: Relationships,
  context: ResolvedSlideContext
): ExtractedShape[] {
  // Parse XML string if needed
  const parsed: ParsedXml = typeof slideXml === 'string'
    ? xmlParser.parse(slideXml) as ParsedXml
    : slideXml;

  const shapes: ExtractedShape[] = [];
  let zIndex = 0;

  // Navigate to the slide's shape tree
  const sld = parsed.sld as Record<string, unknown> | undefined;
  if (!sld) return shapes;

  const cSld = sld.cSld as Record<string, unknown> | undefined;
  if (!cSld) return shapes;

  // Extract background first (z-index 0 conceptually, but stored separately)
  const bg = cSld.bg as Record<string, unknown> | undefined;
  if (bg) {
    const background = extractBackground(bg, relationships, context);
    if (background) {
      shapes.push({
        type: 'background',
        position: { x: 0, y: 0, width: 0, height: 0 },
        zIndex: zIndex++,
        properties: background as unknown as Record<string, unknown>,
      });
    }
  }

  const spTree = cSld.spTree as Record<string, unknown> | undefined;
  if (!spTree) return shapes;

  // Process shapes (sp elements) — text and geometry
  const spElements = ensureArray(spTree.sp as Record<string, unknown>[] | undefined);
  for (const sp of spElements) {
    if (!sp || typeof sp !== 'object') continue;

    if (isTextShape(sp)) {
      const textShape = extractTextShape(sp, context, zIndex++);
      if (textShape) shapes.push(textShape);
    } else {
      shapes.push(extractGeometryShape(sp, context, zIndex++));
    }
  }

  // Process pictures (pic elements) — images
  const picElements = ensureArray(spTree.pic as Record<string, unknown>[] | undefined);
  for (const pic of picElements) {
    if (!pic || typeof pic !== 'object') continue;
    const imageShape = extractImageShape(pic, relationships, context, zIndex++);
    if (imageShape) shapes.push(imageShape);
  }

  // Process graphic frames (graphicFrame elements) — tables and other embedded content
  const graphicFrames = ensureArray(
    spTree.graphicFrame as Record<string, unknown>[] | undefined
  );
  for (const gf of graphicFrames) {
    if (!gf || typeof gf !== 'object') continue;

    if (isTableFrame(gf)) {
      const tableShape = extractTableShape(gf, context, zIndex++);
      if (tableShape) shapes.push(tableShape);
    }
  }

  // Process group shapes (grpSp elements) — flatten nested shapes
  const grpSpElements = ensureArray(spTree.grpSp as Record<string, unknown>[] | undefined);
  for (const grpSp of grpSpElements) {
    if (!grpSp || typeof grpSp !== 'object') continue;
    const groupShapes = extractGroupShapes(grpSp, relationships, context, zIndex);
    shapes.push(...groupShapes);
    zIndex += groupShapes.length;
  }

  return shapes;
}

/**
 * Recursively extracts shapes from a group shape element.
 */
function extractGroupShapes(
  grpSp: Record<string, unknown>,
  relationships: Relationships,
  context: ResolvedSlideContext,
  startZIndex: number
): ExtractedShape[] {
  const shapes: ExtractedShape[] = [];
  let zIndex = startZIndex;

  // Process nested sp elements
  const spElements = ensureArray(grpSp.sp as Record<string, unknown>[] | undefined);
  for (const sp of spElements) {
    if (!sp || typeof sp !== 'object') continue;
    if (isTextShape(sp)) {
      const textShape = extractTextShape(sp, context, zIndex++);
      if (textShape) shapes.push(textShape);
    } else {
      shapes.push(extractGeometryShape(sp, context, zIndex++));
    }
  }

  // Process nested pic elements
  const picElements = ensureArray(grpSp.pic as Record<string, unknown>[] | undefined);
  for (const pic of picElements) {
    if (!pic || typeof pic !== 'object') continue;
    const imageShape = extractImageShape(pic, relationships, context, zIndex++);
    if (imageShape) shapes.push(imageShape);
  }

  // Process nested graphicFrame elements
  const graphicFrames = ensureArray(
    grpSp.graphicFrame as Record<string, unknown>[] | undefined
  );
  for (const gf of graphicFrames) {
    if (!gf || typeof gf !== 'object') continue;
    if (isTableFrame(gf)) {
      const tableShape = extractTableShape(gf, context, zIndex++);
      if (tableShape) shapes.push(tableShape);
    }
  }

  // Recursively process nested group shapes
  const nestedGroups = ensureArray(grpSp.grpSp as Record<string, unknown>[] | undefined);
  for (const nested of nestedGroups) {
    if (!nested || typeof nested !== 'object') continue;
    const nestedShapes = extractGroupShapes(nested, relationships, context, zIndex);
    shapes.push(...nestedShapes);
    zIndex += nestedShapes.length;
  }

  return shapes;
}
