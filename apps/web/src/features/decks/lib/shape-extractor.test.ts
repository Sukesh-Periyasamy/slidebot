import { describe, it, expect } from 'vitest';
import { extractShapes } from './shape-extractor';
import type { ResolvedSlideContext } from './ooxml-resolver';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createDefaultContext(): ResolvedSlideContext {
  return {
    theme: {
      colorScheme: {
        dk1: '#000000',
        lt1: '#FFFFFF',
        dk2: '#44546A',
        lt2: '#E7E6E6',
        accent1: '#4472C4',
        accent2: '#ED7D31',
        accent3: '#A5A5A5',
        accent4: '#FFC000',
        accent5: '#5B9BD5',
        accent6: '#70AD47',
        hlink: '#0563C1',
        folHlink: '#954F72',
      },
      majorFont: 'Calibri Light',
      minorFont: 'Calibri',
    },
    masterDefaults: {},
    layoutDefaults: {},
  };
}

/**
 * Creates a minimal slide XML string with shapes in the spTree.
 */
function wrapInSlide(spTreeContent: string, bgContent = ''): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    ${bgContent}
    <p:spTree>
      <p:nvGrpSpPr/>
      <p:grpSpPr/>
      ${spTreeContent}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

describe('Shape Extractor - extractShapes()', () => {
  const ctx = createDefaultContext();
  const emptyRels = {};

  describe('text extraction', () => {
    it('should extract a text shape with content and font properties', () => {
      const xml = wrapInSlide(`
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="100000" y="200000"/>
              <a:ext cx="5000000" cy="1000000"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:p>
              <a:pPr algn="ctr"/>
              <a:r>
                <a:rPr sz="2400" b="1" i="0">
                  <a:solidFill>
                    <a:srgbClr val="FF0000"/>
                  </a:solidFill>
                  <a:latin typeface="Arial"/>
                </a:rPr>
                <a:t>Hello World</a:t>
              </a:r>
            </a:p>
          </p:txBody>
        </p:sp>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const textShape = shapes.find(s => s.type === 'text');

      expect(textShape).toBeDefined();
      expect(textShape!.position).toEqual({
        x: 100000,
        y: 200000,
        width: 5000000,
        height: 1000000,
      });

      const props = textShape!.properties as Record<string, unknown>;
      expect(props.content).toBe('Hello World');
      expect(props.fontFamily).toBe('Arial');
      expect(props.fontSize).toBe(24);
      expect(props.fontWeight).toBe('bold');
      expect(props.fontStyle).toBe('normal');
      expect(props.color).toBe('#FF0000');
      expect(props.alignment).toBe('center');
    });

    it('should extract multiple paragraphs with different alignments', () => {
      const xml = wrapInSlide(`
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="1000000" cy="500000"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:p>
              <a:pPr algn="l"/>
              <a:r><a:rPr sz="1800"/><a:t>Left</a:t></a:r>
            </a:p>
            <a:p>
              <a:pPr algn="r"/>
              <a:r><a:rPr sz="1800"/><a:t>Right</a:t></a:r>
            </a:p>
          </p:txBody>
        </p:sp>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const textShape = shapes.find(s => s.type === 'text');
      expect(textShape).toBeDefined();

      const props = textShape!.properties as Record<string, unknown>;
      expect(props.content).toBe('Left\nRight');

      const paragraphs = props.paragraphs as Array<{ alignment: string }>;
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0]!.alignment).toBe('left');
      expect(paragraphs[1]!.alignment).toBe('right');
    });

    it('should resolve scheme color references in text', () => {
      const xml = wrapInSlide(`
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="1000000" cy="500000"/>
            </a:xfrm>
          </p:spPr>
          <p:txBody>
            <a:p>
              <a:r>
                <a:rPr sz="1800">
                  <a:solidFill>
                    <a:schemeClr val="accent1"/>
                  </a:solidFill>
                </a:rPr>
                <a:t>Themed text</a:t>
              </a:r>
            </a:p>
          </p:txBody>
        </p:sp>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const textShape = shapes.find(s => s.type === 'text');
      const props = textShape!.properties as Record<string, unknown>;
      expect(props.color).toBe('#4472C4');
    });
  });

  describe('geometry shape extraction', () => {
    it('should extract a geometry shape with fill and outline', () => {
      const xml = wrapInSlide(`
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="500000" y="600000"/>
              <a:ext cx="2000000" cy="1500000"/>
            </a:xfrm>
            <a:prstGeom prst="ellipse"/>
            <a:solidFill>
              <a:srgbClr val="00FF00"/>
            </a:solidFill>
            <a:ln w="25400">
              <a:solidFill>
                <a:srgbClr val="0000FF"/>
              </a:solidFill>
            </a:ln>
          </p:spPr>
        </p:sp>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const geomShape = shapes.find(s => s.type === 'geometry');

      expect(geomShape).toBeDefined();
      expect(geomShape!.position).toEqual({
        x: 500000,
        y: 600000,
        width: 2000000,
        height: 1500000,
      });

      const props = geomShape!.properties as Record<string, unknown>;
      expect(props.shapeType).toBe('ellipse');
      expect(props.fillColor).toBe('#00FF00');
      expect(props.outlineColor).toBe('#0000FF');
      expect(props.outlineWidth).toBe(2); // 25400 / 12700 = 2pt
    });

    it('should default to rect when no preset geometry is specified', () => {
      const xml = wrapInSlide(`
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="1000000" cy="1000000"/>
            </a:xfrm>
          </p:spPr>
        </p:sp>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const geomShape = shapes.find(s => s.type === 'geometry');
      expect(geomShape).toBeDefined();

      const props = geomShape!.properties as Record<string, unknown>;
      expect(props.shapeType).toBe('rect');
    });
  });

  describe('image extraction', () => {
    it('should extract an image shape and resolve relationship', () => {
      const xml = wrapInSlide(`
        <p:pic>
          <p:nvPicPr>
            <p:cNvPr id="4" name="Picture 3" descr="A test image"/>
          </p:nvPicPr>
          <p:blipFill>
            <a:blip embed="rId2"/>
          </p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="300000" y="400000"/>
              <a:ext cx="3000000" cy="2000000"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>
      `);

      const relationships = {
        rId2: 'data:image/png;base64,iVBORw0KGgo=',
      };

      const shapes = extractShapes(xml, relationships, ctx);
      const imgShape = shapes.find(s => s.type === 'image');

      expect(imgShape).toBeDefined();
      expect(imgShape!.position).toEqual({
        x: 300000,
        y: 400000,
        width: 3000000,
        height: 2000000,
      });

      const props = imgShape!.properties as Record<string, unknown>;
      expect(props.dataUri).toBe('data:image/png;base64,iVBORw0KGgo=');
      expect(props.contentType).toBe('image/png');
      expect(props.altText).toBe('A test image');
    });

    it('should determine content type from file extension when not a data URI', () => {
      const xml = wrapInSlide(`
        <p:pic>
          <p:nvPicPr>
            <p:cNvPr id="5" name="Picture 4"/>
          </p:nvPicPr>
          <p:blipFill>
            <a:blip embed="rId3"/>
          </p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="1000000" cy="1000000"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>
      `);

      const relationships = {
        rId3: '../media/image1.jpeg',
      };

      const shapes = extractShapes(xml, relationships, ctx);
      const imgShape = shapes.find(s => s.type === 'image');
      expect(imgShape).toBeDefined();

      const props = imgShape!.properties as Record<string, unknown>;
      expect(props.contentType).toBe('image/jpeg');
    });
  });

  describe('table extraction', () => {
    it('should extract a table with rows, columns, and cell content', () => {
      const xml = wrapInSlide(`
        <p:graphicFrame>
          <p:xfrm>
            <a:off x="100000" y="200000"/>
            <a:ext cx="8000000" cy="3000000"/>
          </p:xfrm>
          <a:graphic>
            <a:graphicData>
              <a:tbl>
                <a:tblGrid>
                  <a:gridCol w="4000000"/>
                  <a:gridCol w="4000000"/>
                </a:tblGrid>
                <a:tr h="1500000">
                  <a:tc>
                    <a:txBody>
                      <a:p><a:r><a:t>Cell A1</a:t></a:r></a:p>
                    </a:txBody>
                  </a:tc>
                  <a:tc>
                    <a:txBody>
                      <a:p><a:r><a:t>Cell B1</a:t></a:r></a:p>
                    </a:txBody>
                  </a:tc>
                </a:tr>
                <a:tr h="1500000">
                  <a:tc>
                    <a:txBody>
                      <a:p><a:r><a:t>Cell A2</a:t></a:r></a:p>
                    </a:txBody>
                  </a:tc>
                  <a:tc>
                    <a:txBody>
                      <a:p><a:r><a:t>Cell B2</a:t></a:r></a:p>
                    </a:txBody>
                  </a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const tableShape = shapes.find(s => s.type === 'table');

      expect(tableShape).toBeDefined();

      const props = tableShape!.properties as Record<string, unknown>;
      expect(props.rows).toBe(2);
      expect(props.columns).toBe(2);

      const cells = props.cells as Array<Array<{ content: string }>>;
      expect(cells[0]![0]!.content).toBe('Cell A1');
      expect(cells[0]![1]!.content).toBe('Cell B1');
      expect(cells[1]![0]!.content).toBe('Cell A2');
      expect(cells[1]![1]!.content).toBe('Cell B2');
    });

    it('should extract cell merge information', () => {
      const xml = wrapInSlide(`
        <p:graphicFrame>
          <p:xfrm>
            <a:off x="0" y="0"/>
            <a:ext cx="6000000" cy="2000000"/>
          </p:xfrm>
          <a:graphic>
            <a:graphicData>
              <a:tbl>
                <a:tblGrid>
                  <a:gridCol w="3000000"/>
                  <a:gridCol w="3000000"/>
                </a:tblGrid>
                <a:tr h="1000000">
                  <a:tc gridSpan="2">
                    <a:txBody>
                      <a:p><a:r><a:t>Merged</a:t></a:r></a:p>
                    </a:txBody>
                  </a:tc>
                </a:tr>
              </a:tbl>
            </a:graphicData>
          </a:graphic>
        </p:graphicFrame>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const tableShape = shapes.find(s => s.type === 'table');
      expect(tableShape).toBeDefined();

      const props = tableShape!.properties as Record<string, unknown>;
      const merges = props.merges as Array<{
        startRow: number;
        startCol: number;
        rowSpan: number;
        colSpan: number;
      }>;
      expect(merges.length).toBeGreaterThan(0);
      expect(merges[0]).toEqual({
        startRow: 0,
        startCol: 0,
        rowSpan: 1,
        colSpan: 2,
      });
    });
  });

  describe('background extraction', () => {
    it('should extract a solid fill background', () => {
      const xml = wrapInSlide('', `
        <p:bg>
          <p:bgPr>
            <a:solidFill>
              <a:srgbClr val="336699"/>
            </a:solidFill>
          </p:bgPr>
        </p:bg>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const bgShape = shapes.find(s => s.type === 'background');

      expect(bgShape).toBeDefined();
      const props = bgShape!.properties as Record<string, unknown>;
      expect(props.type).toBe('solid');
      expect(props.color).toBe('#336699');
    });

    it('should extract a gradient fill background', () => {
      const xml = wrapInSlide('', `
        <p:bg>
          <p:bgPr>
            <a:gradFill>
              <a:gsLst>
                <a:gs pos="0">
                  <a:srgbClr val="FF0000"/>
                </a:gs>
                <a:gs pos="100000">
                  <a:srgbClr val="0000FF"/>
                </a:gs>
              </a:gsLst>
            </a:gradFill>
          </p:bgPr>
        </p:bg>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      const bgShape = shapes.find(s => s.type === 'background');

      expect(bgShape).toBeDefined();
      const props = bgShape!.properties as Record<string, unknown>;
      expect(props.type).toBe('gradient');

      const stops = props.gradientStops as Array<{ offset: number; color: string }>;
      expect(stops).toHaveLength(2);
      expect(stops[0]).toEqual({ offset: 0, color: '#FF0000' });
      expect(stops[1]).toEqual({ offset: 1, color: '#0000FF' });
    });

    it('should extract a background image', () => {
      const xml = wrapInSlide('', `
        <p:bg>
          <p:bgPr>
            <a:blipFill>
              <a:blip embed="rId1"/>
            </a:blipFill>
          </p:bgPr>
        </p:bg>
      `);

      const relationships = {
        rId1: 'data:image/jpeg;base64,/9j/4AAQ=',
      };

      const shapes = extractShapes(xml, relationships, ctx);
      const bgShape = shapes.find(s => s.type === 'background');

      expect(bgShape).toBeDefined();
      const props = bgShape!.properties as Record<string, unknown>;
      expect(props.type).toBe('image');
      expect(props.imageDataUri).toBe('data:image/jpeg;base64,/9j/4AAQ=');
    });
  });

  describe('z-order preservation', () => {
    it('should assign incrementing z-index based on XML order', () => {
      const xml = wrapInSlide(`
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="1000000" cy="1000000"/>
            </a:xfrm>
            <a:prstGeom prst="rect"/>
          </p:spPr>
        </p:sp>
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="100000" y="100000"/>
              <a:ext cx="1000000" cy="1000000"/>
            </a:xfrm>
            <a:prstGeom prst="ellipse"/>
          </p:spPr>
        </p:sp>
        <p:sp>
          <p:spPr>
            <a:xfrm>
              <a:off x="200000" y="200000"/>
              <a:ext cx="1000000" cy="1000000"/>
            </a:xfrm>
            <a:prstGeom prst="roundRect"/>
          </p:spPr>
        </p:sp>
      `);

      const shapes = extractShapes(xml, emptyRels, ctx);
      expect(shapes.length).toBe(3);

      // z-index should be incrementing
      expect(shapes[0]!.zIndex).toBeLessThan(shapes[1]!.zIndex);
      expect(shapes[1]!.zIndex).toBeLessThan(shapes[2]!.zIndex);
    });
  });

  describe('relationship resolution', () => {
    it('should resolve image relationships using the provided map', () => {
      const xml = wrapInSlide(`
        <p:pic>
          <p:nvPicPr>
            <p:cNvPr id="2" name="Pic"/>
          </p:nvPicPr>
          <p:blipFill>
            <a:blip embed="rId5"/>
          </p:blipFill>
          <p:spPr>
            <a:xfrm>
              <a:off x="0" y="0"/>
              <a:ext cx="1000000" cy="1000000"/>
            </a:xfrm>
          </p:spPr>
        </p:pic>
      `);

      const relationships = {
        rId5: 'data:image/png;base64,AAAA',
      };

      const shapes = extractShapes(xml, relationships, ctx);
      const imgShape = shapes.find(s => s.type === 'image');
      expect(imgShape).toBeDefined();

      const props = imgShape!.properties as Record<string, unknown>;
      expect(props.dataUri).toBe('data:image/png;base64,AAAA');
    });
  });

  describe('empty/missing content', () => {
    it('should return empty array for slide with no shapes', () => {
      const xml = wrapInSlide('');
      const shapes = extractShapes(xml, emptyRels, ctx);
      expect(shapes).toEqual([]);
    });

    it('should handle missing spTree gracefully', () => {
      const xml = `<?xml version="1.0"?>
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
          <p:cSld/>
        </p:sld>`;
      const shapes = extractShapes(xml, emptyRels, ctx);
      expect(shapes).toEqual([]);
    });
  });
});
