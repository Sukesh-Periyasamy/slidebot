import { describe, it, expect } from 'vitest';
import { normalize, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, ExtractedShape } from './scene-graph-normalizer.js';

describe('Scene Graph Normalizer - normalize()', () => {
  // Standard PPTX slide dimensions: 9144000 × 6858000 EMU (10" × 7.5")
  const STANDARD_WIDTH = 9144000;
  const STANDARD_HEIGHT = 6858000;

  describe('coordinate conversion formula', () => {
    it('should convert EMU coordinates to viewport coordinates for standard slide dimensions', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: 9144000, height: 6858000 },
          properties: { shapeType: 'rect', fillColor: '#FF0000' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);

      // For standard 4:3 slides (9144000 × 6858000):
      // scaleX = 1920 / 9144000 ≈ 0.000209974
      // scaleY = 1080 / 6858000 ≈ 0.000157480
      // scale = min(scaleX, scaleY) = scaleY ≈ 0.000157480
      // offsetX = (1920 - 9144000 * 0.000157480) / 2 = (1920 - 1440) / 2 = 240
      // offsetY = (1080 - 6858000 * 0.000157480) / 2 = (1080 - 1080) / 2 = 0
      expect(result).toHaveLength(1);
      expect(result[0].x).toBe(240);
      expect(result[0].y).toBe(0);
      expect(result[0].width).toBe(1440);
      expect(result[0].height).toBe(1080);
    });

    it('should center content horizontally for 4:3 aspect ratio slides', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: 1000000, height: 1000000 },
          properties: { shapeType: 'rect' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);

      // scale = min(1920/9144000, 1080/6858000) = 1080/6858000
      // offsetX = (1920 - 9144000 * scale) / 2 = 240
      // x = 0 * scale + 240 = 240
      expect(result[0].x).toBe(240);
      expect(result[0].y).toBe(0);
    });

    it('should center content vertically for wide aspect ratio slides', () => {
      // 16:9 widescreen: 12192000 × 6858000 EMU
      const wideWidth = 12192000;
      const wideHeight = 6858000;

      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: wideWidth, height: wideHeight },
          properties: { shapeType: 'rect' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, wideWidth, wideHeight);

      // scaleX = 1920 / 12192000 ≈ 0.000157480
      // scaleY = 1080 / 6858000 ≈ 0.000157480
      // scale = min(scaleX, scaleY) = scaleX ≈ 0.000157480
      // For 16:9 source fitting into 16:9 viewport, no offset needed
      expect(result[0].x).toBe(0);
      expect(result[0].y).toBe(0);
      expect(result[0].width).toBe(1920);
      expect(result[0].height).toBe(1080);
    });

    it('should handle a shape positioned in the middle of the slide', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'text',
          position: { x: 4572000, y: 3429000, width: 914400, height: 457200 },
          properties: {
            content: 'Hello',
            fontFamily: 'Arial',
            fontSize: 24,
            fontWeight: 'normal' as const,
            fontStyle: 'normal' as const,
            color: '#000000',
            alignment: 'left' as const,
            paragraphs: [],
          },
          zIndex: 1,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);

      // scale = 1080 / 6858000
      // offsetX = 240, offsetY = 0
      // x = 4572000 * (1080/6858000) + 240 = 720 + 240 = 960
      // y = 3429000 * (1080/6858000) + 0 = 540
      // width = 914400 * (1080/6858000) = 144
      // height = 457200 * (1080/6858000) = 72
      expect(result[0].x).toBe(960);
      expect(result[0].y).toBe(540);
      expect(result[0].width).toBe(144);
      expect(result[0].height).toBe(72);
    });
  });

  describe('rounding to 2 decimal places', () => {
    it('should round all coordinates to 2 decimal places', () => {
      // Use dimensions that produce non-integer results
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 1000000, y: 1000000, width: 3333333, height: 2222222 },
          properties: { shapeType: 'ellipse' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);

      // Verify all coordinates have at most 2 decimal places
      const hasAtMost2Decimals = (n: number) => {
        const str = n.toString();
        const decimalIndex = str.indexOf('.');
        if (decimalIndex === -1) return true;
        return str.length - decimalIndex - 1 <= 2;
      };

      expect(hasAtMost2Decimals(result[0].x)).toBe(true);
      expect(hasAtMost2Decimals(result[0].y)).toBe(true);
      expect(hasAtMost2Decimals(result[0].width)).toBe(true);
      expect(hasAtMost2Decimals(result[0].height)).toBe(true);
    });
  });

  describe('type mapping', () => {
    it('should map "geometry" type to "shape" in output', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: 1000000, height: 1000000 },
          properties: { shapeType: 'rect', fillColor: '#FF0000' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result[0].type).toBe('shape');
    });

    it('should preserve "text" type', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'text',
          position: { x: 0, y: 0, width: 1000000, height: 500000 },
          properties: {
            content: 'Test',
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 'normal' as const,
            fontStyle: 'normal' as const,
            color: '#000000',
            alignment: 'left' as const,
            paragraphs: [],
          },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result[0].type).toBe('text');
    });

    it('should preserve "image" type', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'image',
          position: { x: 0, y: 0, width: 1000000, height: 1000000 },
          properties: { dataUri: 'data:image/png;base64,abc', contentType: 'image/png' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result[0].type).toBe('image');
    });

    it('should preserve "table" type', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'table',
          position: { x: 0, y: 0, width: 2000000, height: 1000000 },
          properties: { rows: 2, columns: 2, cells: [], merges: [] },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result[0].type).toBe('table');
    });

    it('should convert unsupported types to "placeholder"', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'chart',
          position: { x: 100000, y: 200000, width: 3000000, height: 2000000 },
          properties: {},
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result[0].type).toBe('placeholder');
      if (result[0].type === 'placeholder') {
        expect(result[0].properties.unsupportedType).toBe('chart');
      }
    });
  });

  describe('z-order preservation', () => {
    it('should preserve zIndex from input shapes', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: 1000000, height: 1000000 },
          properties: { shapeType: 'rect' },
          zIndex: 0,
        },
        {
          type: 'text',
          position: { x: 100000, y: 100000, width: 500000, height: 300000 },
          properties: {
            content: 'On top',
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 'normal' as const,
            fontStyle: 'normal' as const,
            color: '#000000',
            alignment: 'left' as const,
            paragraphs: [],
          },
          zIndex: 1,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result[0].zIndex).toBe(0);
      expect(result[1].zIndex).toBe(1);
    });

    it('should preserve array ordering from input', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: 1000000, height: 1000000 },
          properties: { shapeType: 'rect' },
          zIndex: 0,
        },
        {
          type: 'geometry',
          position: { x: 500000, y: 500000, width: 1000000, height: 1000000 },
          properties: { shapeType: 'ellipse' },
          zIndex: 1,
        },
        {
          type: 'text',
          position: { x: 1000000, y: 1000000, width: 2000000, height: 500000 },
          properties: {
            content: 'Top',
            fontFamily: 'Arial',
            fontSize: 12,
            fontWeight: 'normal' as const,
            fontStyle: 'normal' as const,
            color: '#000000',
            alignment: 'left' as const,
            paragraphs: [],
          },
          zIndex: 2,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('shape');
      expect(result[1].type).toBe('shape');
      expect(result[2].type).toBe('text');
    });
  });

  describe('empty input', () => {
    it('should return empty array for empty shapes input', () => {
      const result = normalize([], STANDARD_WIDTH, STANDARD_HEIGHT);
      expect(result).toEqual([]);
    });
  });

  describe('aspect ratio preservation', () => {
    it('should preserve element aspect ratio after conversion', () => {
      const shapes: ExtractedShape[] = [
        {
          type: 'geometry',
          position: { x: 0, y: 0, width: 2000000, height: 1000000 }, // 2:1 ratio
          properties: { shapeType: 'rect' },
          zIndex: 0,
        },
      ];

      const result = normalize(shapes, STANDARD_WIDTH, STANDARD_HEIGHT);

      // The element's aspect ratio should be preserved
      const sourceRatio = 2000000 / 1000000;
      const resultRatio = result[0].width / result[0].height;
      expect(resultRatio).toBeCloseTo(sourceRatio, 5);
    });
  });
});
