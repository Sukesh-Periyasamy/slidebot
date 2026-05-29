import { describe, it, expect } from 'vitest';
import {
  serialize,
  deserialize,
  type PresentationDocument,
} from './scene-graph';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const minimalDoc: PresentationDocument = {
  slides: [],
  metadata: {
    title: 'Test Presentation',
    author: 'Test Author',
    slideCount: 0,
    sourceWidth: 9144000,
    sourceHeight: 6858000,
  },
};

const fullDoc: PresentationDocument = {
  slides: [
    {
      elements: [
        {
          type: 'text',
          x: 100.5,
          y: 200.25,
          width: 400,
          height: 50,
          zIndex: 0,
          properties: {
            content: 'Hello World',
            fontFamily: 'Arial',
            fontSize: 24,
            fontWeight: 'bold',
            fontStyle: 'normal',
            color: '#FF0000',
            alignment: 'center',
            paragraphs: [
              {
                runs: [
                  { text: 'Hello ', bold: true, color: '#FF0000' },
                  { text: 'World', italic: true, fontFamily: 'Times' },
                ],
                alignment: 'center',
              },
            ],
          },
        },
        {
          type: 'shape',
          x: 50,
          y: 300,
          width: 200,
          height: 150,
          zIndex: 1,
          properties: {
            shapeType: 'rect',
            fillColor: '#00FF00',
            outlineColor: '#000000',
            outlineWidth: 2,
          },
        },
        {
          type: 'image',
          x: 500,
          y: 100,
          width: 300,
          height: 200,
          zIndex: 2,
          properties: {
            dataUri: 'data:image/png;base64,iVBORw0KGgo=',
            contentType: 'image/png',
            altText: 'Sample image',
          },
        },
        {
          type: 'table',
          x: 100,
          y: 500,
          width: 600,
          height: 300,
          zIndex: 3,
          properties: {
            rows: 2,
            columns: 2,
            cells: [
              [
                { content: 'A1', rowSpan: 1, colSpan: 1 },
                { content: 'B1', rowSpan: 1, colSpan: 1 },
              ],
              [
                { content: 'A2', rowSpan: 1, colSpan: 1 },
                { content: 'B2', rowSpan: 1, colSpan: 1 },
              ],
            ],
            merges: [],
          },
        },
        {
          type: 'placeholder',
          x: 800,
          y: 400,
          width: 100,
          height: 100,
          zIndex: 4,
          properties: {
            unsupportedType: 'chart',
          },
        },
      ],
      background: {
        type: 'solid',
        color: '#FFFFFF',
      },
    },
  ],
  metadata: {
    title: 'Full Presentation',
    author: 'Author Name',
    slideCount: 1,
    sourceWidth: 9144000,
    sourceHeight: 6858000,
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('serialize', () => {
  it('produces valid JSON', () => {
    const json = serialize(minimalDoc);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('produces compact JSON by default', () => {
    const json = serialize(minimalDoc);
    expect(json).not.toContain('\n');
  });

  it('produces pretty JSON with 2-space indentation when pretty is true', () => {
    const json = serialize(minimalDoc, true);
    expect(json).toContain('\n');
    // Check 2-space indentation
    expect(json).toContain('  "slides"');
  });

  it('serializes all element types correctly', () => {
    const json = serialize(fullDoc);
    const parsed = JSON.parse(json);
    expect(parsed.slides[0].elements).toHaveLength(5);
    expect(parsed.slides[0].elements[0].type).toBe('text');
    expect(parsed.slides[0].elements[1].type).toBe('shape');
    expect(parsed.slides[0].elements[2].type).toBe('image');
    expect(parsed.slides[0].elements[3].type).toBe('table');
    expect(parsed.slides[0].elements[4].type).toBe('placeholder');
  });
});

describe('deserialize', () => {
  it('deserializes valid JSON into a PresentationDocument', () => {
    const json = serialize(minimalDoc);
    const result = deserialize(json);
    expect(result).toEqual(minimalDoc);
  });

  it('deserializes a full document with all element types', () => {
    const json = serialize(fullDoc);
    const result = deserialize(json);
    expect(result).toEqual(fullDoc);
  });

  it('throws on invalid JSON', () => {
    expect(() => deserialize('not json')).toThrow('Failed to parse JSON');
  });

  it('throws on empty string', () => {
    expect(() => deserialize('')).toThrow('Failed to parse JSON');
  });

  it('throws when slides is missing', () => {
    const json = JSON.stringify({ metadata: minimalDoc.metadata });
    expect(() => deserialize(json)).toThrow('Invalid PresentationDocument');
  });

  it('throws when metadata is missing', () => {
    const json = JSON.stringify({ slides: [] });
    expect(() => deserialize(json)).toThrow('Invalid PresentationDocument');
  });

  it('throws when element type is invalid', () => {
    const invalid = {
      slides: [
        {
          elements: [
            {
              type: 'unknown',
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              zIndex: 0,
              properties: {},
            },
          ],
        },
      ],
      metadata: minimalDoc.metadata,
    };
    expect(() => deserialize(JSON.stringify(invalid))).toThrow(
      'Invalid PresentationDocument'
    );
  });

  it('throws when metadata fields have wrong types', () => {
    const invalid = {
      slides: [],
      metadata: {
        title: 123, // should be string
        author: 'Author',
        slideCount: 1,
        sourceWidth: 9144000,
        sourceHeight: 6858000,
      },
    };
    expect(() => deserialize(JSON.stringify(invalid))).toThrow(
      'Invalid PresentationDocument'
    );
  });
});

describe('round-trip consistency', () => {
  it('deserialize(serialize(doc)) produces a deeply-equal document (minimal)', () => {
    const result = deserialize(serialize(minimalDoc));
    expect(result).toEqual(minimalDoc);
  });

  it('deserialize(serialize(doc)) produces a deeply-equal document (full)', () => {
    const result = deserialize(serialize(fullDoc));
    expect(result).toEqual(fullDoc);
  });
});

describe('idempotence', () => {
  it('serialize(deserialize(serialize(doc))) === serialize(doc) (minimal)', () => {
    const first = serialize(minimalDoc);
    const second = serialize(deserialize(first));
    expect(second).toBe(first);
  });

  it('serialize(deserialize(serialize(doc))) === serialize(doc) (full)', () => {
    const first = serialize(fullDoc);
    const second = serialize(deserialize(first));
    expect(second).toBe(first);
  });

  it('idempotence holds for pretty-printed output', () => {
    const first = serialize(fullDoc, true);
    const deserialized = deserialize(first);
    const second = serialize(deserialized, true);
    expect(second).toBe(first);
  });
});
