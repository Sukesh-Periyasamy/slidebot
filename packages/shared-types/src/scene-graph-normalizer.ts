// ─────────────────────────────────────────────────────────────────────────────
// Scene Graph Normalizer — EMU to Virtual Viewport coordinate conversion
// ─────────────────────────────────────────────────────────────────────────────

import type {
  SlideElement,
  TextElement,
  ShapeElement,
  ImageElement,
  TableElement,
  PlaceholderElement,
  ElementProperties,
} from './scene-graph.js';

// ─── Virtual Viewport Constants ──────────────────────────────────────────────

export const VIEWPORT_WIDTH = 1920;
export const VIEWPORT_HEIGHT = 1080;

// ─── Input Types ─────────────────────────────────────────────────────────────

/**
 * Represents a shape extracted from PPTX slide XML with EMU coordinates.
 * This is the input to the normalize function before viewport conversion.
 */
export interface ExtractedShape {
  type: 'text' | 'geometry' | 'image' | 'table' | 'background' | string;
  position: {
    x: number;      // EMU
    y: number;      // EMU
    width: number;  // EMU
    height: number; // EMU
  };
  properties: ElementProperties | Record<string, unknown>;
  zIndex: number;
}

// ─── Supported Types ─────────────────────────────────────────────────────────

const SUPPORTED_TYPES = new Set(['text', 'geometry', 'image', 'table', 'background']);

/**
 * Maps ExtractedShape type identifiers to SlideElement type identifiers.
 * 'geometry' in the extraction layer maps to 'shape' in the scene graph.
 */
function mapElementType(extractedType: string): SlideElement['type'] | null {
  switch (extractedType) {
    case 'text': return 'text';
    case 'geometry': return 'shape';
    case 'image': return 'image';
    case 'table': return 'table';
    default: return null;
  }
}

// ─── Coordinate Conversion ───────────────────────────────────────────────────

/**
 * Rounds a number to 2 decimal places.
 */
function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Converts EMU coordinates to Virtual Viewport coordinates.
 *
 * The conversion preserves the source aspect ratio and centers content
 * within the 1920×1080 viewport.
 *
 * Formula:
 *   scaleX = 1920 / sourceWidth
 *   scaleY = 1080 / sourceHeight
 *   scale = min(scaleX, scaleY)
 *   offsetX = (1920 - sourceWidth * scale) / 2
 *   offsetY = (1080 - sourceHeight * scale) / 2
 *   viewportX = round(emuX * scale + offsetX, 2)
 *   viewportY = round(emuY * scale + offsetY, 2)
 *   viewportW = round(emuWidth * scale, 2)
 *   viewportH = round(emuHeight * scale, 2)
 */
export function normalize(
  shapes: ExtractedShape[],
  sourceWidth: number,
  sourceHeight: number
): SlideElement[] {
  const scaleX = VIEWPORT_WIDTH / sourceWidth;
  const scaleY = VIEWPORT_HEIGHT / sourceHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = (VIEWPORT_WIDTH - sourceWidth * scale) / 2;
  const offsetY = (VIEWPORT_HEIGHT - sourceHeight * scale) / 2;

  return shapes.map((shape) => {
    const x = roundTo2(shape.position.x * scale + offsetX);
    const y = roundTo2(shape.position.y * scale + offsetY);
    const width = roundTo2(shape.position.width * scale);
    const height = roundTo2(shape.position.height * scale);
    const zIndex = shape.zIndex;

    const mappedType = mapElementType(shape.type);

    // Unsupported types become placeholder elements
    if (mappedType === null) {
      return {
        type: 'placeholder',
        x,
        y,
        width,
        height,
        zIndex,
        properties: {
          unsupportedType: shape.type,
        },
      } as PlaceholderElement;
    }

    // Supported types retain their mapped type and properties
    switch (mappedType) {
      case 'text':
        return {
          type: 'text',
          x,
          y,
          width,
          height,
          zIndex,
          properties: shape.properties,
        } as TextElement;

      case 'shape':
        return {
          type: 'shape',
          x,
          y,
          width,
          height,
          zIndex,
          properties: shape.properties,
        } as ShapeElement;

      case 'image':
        return {
          type: 'image',
          x,
          y,
          width,
          height,
          zIndex,
          properties: shape.properties,
        } as ImageElement;

      case 'table':
        return {
          type: 'table',
          x,
          y,
          width,
          height,
          zIndex,
          properties: shape.properties,
        } as TableElement;

      default:
        return {
          type: 'placeholder',
          x,
          y,
          width,
          height,
          zIndex,
          properties: {
            unsupportedType: shape.type,
          },
        } as PlaceholderElement;
    }
  });
}
