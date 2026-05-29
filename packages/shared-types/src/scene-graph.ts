// ─────────────────────────────────────────────────────────────────────────────
// Scene Graph Types — Unified representation for PPTX slide content
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─── Root Document ───────────────────────────────────────────────────────────

export interface PresentationDocument {
  slides: Slide[];
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  title: string;
  author: string;
  slideCount: number;
  sourceWidth: number;   // Original EMU width
  sourceHeight: number;  // Original EMU height
}

// ─── Slide ───────────────────────────────────────────────────────────────────

export interface Slide {
  elements: SlideElement[];
  background?: BackgroundElement;
}

// ─── Base Element ────────────────────────────────────────────────────────────

export interface BaseElement {
  x: number;      // Virtual viewport (0–1920), 2 decimal places
  y: number;      // Virtual viewport (0–1080), 2 decimal places
  width: number;  // Virtual viewport units, 2 decimal places
  height: number; // Virtual viewport units, 2 decimal places
  zIndex: number;
}

// ─── Text Element ────────────────────────────────────────────────────────────

export interface Paragraph {
  runs: TextRun[];
  alignment: 'left' | 'center' | 'right' | 'justify';
}

export interface TextRun {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  properties: {
    content: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    color: string;          // #RRGGBB
    alignment: 'left' | 'center' | 'right' | 'justify';
    paragraphs: Paragraph[];
  };
}

// ─── Shape Element ───────────────────────────────────────────────────────────

export interface ShapeElement extends BaseElement {
  type: 'shape';
  properties: {
    shapeType: string;      // e.g., 'rect', 'ellipse', 'roundRect'
    fillColor?: string;     // #RRGGBB
    outlineColor?: string;  // #RRGGBB
    outlineWidth?: number;
  };
}

// ─── Image Element ───────────────────────────────────────────────────────────

export interface ImageElement extends BaseElement {
  type: 'image';
  properties: {
    dataUri: string;        // base64 data URI for client-side
    contentType: string;    // e.g., 'image/png'
    altText?: string;
  };
}

// ─── Table Element ───────────────────────────────────────────────────────────

export interface TableCell {
  content: string;
  rowSpan: number;
  colSpan: number;
}

export interface CellMerge {
  startRow: number;
  startCol: number;
  rowSpan: number;
  colSpan: number;
}

export interface TableElement extends BaseElement {
  type: 'table';
  properties: {
    rows: number;
    columns: number;
    cells: TableCell[][];
    merges: CellMerge[];
  };
}

// ─── Placeholder Element ─────────────────────────────────────────────────────

export interface PlaceholderElement extends BaseElement {
  type: 'placeholder';
  properties: {
    unsupportedType: string;
  };
}

// ─── Background Element ──────────────────────────────────────────────────────

export interface BackgroundElement {
  type: 'solid' | 'gradient' | 'image';
  color?: string;
  gradientStops?: { offset: number; color: string }[];
  imageDataUri?: string;
}

// ─── Discriminated Union ─────────────────────────────────────────────────────

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | TableElement
  | PlaceholderElement;

// ─── Element Properties Union ────────────────────────────────────────────────

export type ElementProperties =
  | TextElement['properties']
  | ShapeElement['properties']
  | ImageElement['properties']
  | TableElement['properties']
  | PlaceholderElement['properties'];


// ─── Zod Schemas for Validation ──────────────────────────────────────────────

const TextRunSchema = z.object({
  text: z.string(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: z.string().optional(),
});

const ParagraphSchema = z.object({
  runs: z.array(TextRunSchema),
  alignment: z.enum(['left', 'center', 'right', 'justify']),
});

const TextPropertiesSchema = z.object({
  content: z.string(),
  fontFamily: z.string(),
  fontSize: z.number(),
  fontWeight: z.enum(['normal', 'bold']),
  fontStyle: z.enum(['normal', 'italic']),
  color: z.string(),
  alignment: z.enum(['left', 'center', 'right', 'justify']),
  paragraphs: z.array(ParagraphSchema),
});

const ShapePropertiesSchema = z.object({
  shapeType: z.string(),
  fillColor: z.string().optional(),
  outlineColor: z.string().optional(),
  outlineWidth: z.number().optional(),
});

const ImagePropertiesSchema = z.object({
  dataUri: z.string(),
  contentType: z.string(),
  altText: z.string().optional(),
});

const TableCellSchema = z.object({
  content: z.string(),
  rowSpan: z.number(),
  colSpan: z.number(),
});

const CellMergeSchema = z.object({
  startRow: z.number(),
  startCol: z.number(),
  rowSpan: z.number(),
  colSpan: z.number(),
});

const TablePropertiesSchema = z.object({
  rows: z.number(),
  columns: z.number(),
  cells: z.array(z.array(TableCellSchema)),
  merges: z.array(CellMergeSchema),
});

const PlaceholderPropertiesSchema = z.object({
  unsupportedType: z.string(),
});

const TextElementSchema = z.object({
  type: z.literal('text'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  properties: TextPropertiesSchema,
});

const ShapeElementSchema = z.object({
  type: z.literal('shape'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  properties: ShapePropertiesSchema,
});

const ImageElementSchema = z.object({
  type: z.literal('image'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  properties: ImagePropertiesSchema,
});

const TableElementSchema = z.object({
  type: z.literal('table'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  properties: TablePropertiesSchema,
});

const PlaceholderElementSchema = z.object({
  type: z.literal('placeholder'),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number(),
  properties: PlaceholderPropertiesSchema,
});

const SlideElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  ShapeElementSchema,
  ImageElementSchema,
  TableElementSchema,
  PlaceholderElementSchema,
]);

const GradientStopSchema = z.object({
  offset: z.number(),
  color: z.string(),
});

const BackgroundElementSchema = z.object({
  type: z.enum(['solid', 'gradient', 'image']),
  color: z.string().optional(),
  gradientStops: z.array(GradientStopSchema).optional(),
  imageDataUri: z.string().optional(),
});

const SlideSchema = z.object({
  elements: z.array(SlideElementSchema),
  background: BackgroundElementSchema.optional(),
});

const DocumentMetadataSchema = z.object({
  title: z.string(),
  author: z.string(),
  slideCount: z.number(),
  sourceWidth: z.number(),
  sourceHeight: z.number(),
});

const PresentationDocumentSchema = z.object({
  slides: z.array(SlideSchema),
  metadata: DocumentMetadataSchema,
});

// ─── Serialization / Deserialization ─────────────────────────────────────────

/**
 * Serializes a PresentationDocument to a JSON string.
 * When `pretty` is true, the output is formatted with 2-space indentation.
 */
export function serialize(doc: PresentationDocument, pretty?: boolean): string {
  if (pretty) {
    return JSON.stringify(doc, null, 2);
  }
  return JSON.stringify(doc);
}

/**
 * Deserializes a JSON string into a validated PresentationDocument.
 * Throws an error if the JSON is malformed or does not conform to the schema.
 */
export function deserialize(json: string): PresentationDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(
      `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const result = PresentationDocumentSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid PresentationDocument: ${result.error.message}`
    );
  }

  // Return the original parsed object to preserve JSON property ordering
  // for idempotent serialization. Zod validation above ensures correctness.
  return parsed as PresentationDocument;
}
