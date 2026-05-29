import { describe, it, expect } from 'vitest';
import {
  resolveSlideContext,
  resolveSchemeColor,
  resolveFontReference,
  mergeShapeDefaults,
} from './ooxml-resolver';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const SAMPLE_THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
      <a:accent2><a:srgbClr val="ED7D31"/></a:accent2>
      <a:accent3><a:srgbClr val="A5A5A5"/></a:accent3>
      <a:accent4><a:srgbClr val="FFC000"/></a:accent4>
      <a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>
      <a:accent6><a:srgbClr val="70AD47"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Office">
      <a:majorFont>
        <a:latin typeface="Calibri Light"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Calibri"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>`;

const SAMPLE_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:txStyles>
    <p:bodyStyle>
      <a:lvl1pPr>
        <a:defRPr sz="2400" b="0">
          <a:solidFill><a:srgbClr val="333333"/></a:solidFill>
          <a:latin typeface="Arial"/>
        </a:defRPr>
      </a:lvl1pPr>
    </p:bodyStyle>
  </p:txStyles>
</p:sldMaster>`;

const SAMPLE_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
  <p:txStyles>
    <p:bodyStyle>
      <a:lvl1pPr>
        <a:defRPr sz="1800">
          <a:solidFill><a:srgbClr val="555555"/></a:solidFill>
        </a:defRPr>
      </a:lvl1pPr>
    </p:bodyStyle>
  </p:txStyles>
</p:sldLayout>`;

const MINIMAL_MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:grpSpPr/></p:spTree></p:cSld>
</p:sldMaster>`;

const MINIMAL_LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:grpSpPr/></p:spTree></p:cSld>
</p:sldLayout>`;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('OOXML Resolver', () => {
  describe('resolveSlideContext', () => {
    it('should parse theme color scheme correctly', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(context.theme.colorScheme).toEqual({
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
      });
    });

    it('should parse major and minor font families', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(context.theme.majorFont).toBe('Calibri Light');
      expect(context.theme.minorFont).toBe('Calibri');
    });

    it('should extract master defaults from txStyles', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, SAMPLE_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(context.masterDefaults.fontSize).toBe(24); // 2400/100
      expect(context.masterDefaults.fontColor).toBe('#333333');
      expect(context.masterDefaults.fontFamily).toBe('Arial');
    });

    it('should extract layout defaults from txStyles', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, SAMPLE_LAYOUT_XML);

      expect(context.layoutDefaults.fontSize).toBe(18); // 1800/100
      expect(context.layoutDefaults.fontColor).toBe('#555555');
    });

    it('should return empty defaults for minimal master/layout', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(context.masterDefaults).toEqual({});
      expect(context.layoutDefaults).toEqual({});
    });

    it('should handle theme with missing color scheme gracefully', () => {
      const emptyTheme = `<?xml version="1.0"?>
        <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:themeElements>
            <a:fontScheme name="Office">
              <a:majorFont><a:latin typeface="Arial"/></a:majorFont>
              <a:minorFont><a:latin typeface="Times New Roman"/></a:minorFont>
            </a:fontScheme>
          </a:themeElements>
        </a:theme>`;

      const context = resolveSlideContext(emptyTheme, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(context.theme.colorScheme).toEqual({});
      expect(context.theme.majorFont).toBe('Arial');
      expect(context.theme.minorFont).toBe('Times New Roman');
    });

    it('should use default fonts when font scheme is missing', () => {
      const noFontTheme = `<?xml version="1.0"?>
        <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:themeElements>
            <a:clrScheme name="Office">
              <a:accent1><a:srgbClr val="FF0000"/></a:accent1>
            </a:clrScheme>
          </a:themeElements>
        </a:theme>`;

      const context = resolveSlideContext(noFontTheme, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(context.theme.majorFont).toBe('Calibri Light');
      expect(context.theme.minorFont).toBe('Calibri');
      expect(context.theme.colorScheme.accent1).toBe('#FF0000');
    });
  });

  describe('resolveSchemeColor', () => {
    it('should resolve a known scheme color', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(resolveSchemeColor('accent1', context)).toBe('#4472C4');
      expect(resolveSchemeColor('dk1', context)).toBe('#000000');
      expect(resolveSchemeColor('hlink', context)).toBe('#0563C1');
    });

    it('should return null for unknown scheme color', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(resolveSchemeColor('nonexistent', context)).toBeNull();
    });
  });

  describe('resolveFontReference', () => {
    it('should resolve major font references', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(resolveFontReference('+mj-lt', context)).toBe('Calibri Light');
      expect(resolveFontReference('+mj-ea', context)).toBe('Calibri Light');
      expect(resolveFontReference('+mj-cs', context)).toBe('Calibri Light');
    });

    it('should resolve minor font references', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(resolveFontReference('+mn-lt', context)).toBe('Calibri');
      expect(resolveFontReference('+mn-ea', context)).toBe('Calibri');
      expect(resolveFontReference('+mn-cs', context)).toBe('Calibri');
    });

    it('should return direct font names unchanged', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);

      expect(resolveFontReference('Arial', context)).toBe('Arial');
      expect(resolveFontReference('Times New Roman', context)).toBe('Times New Roman');
    });
  });

  describe('mergeShapeDefaults', () => {
    it('should merge defaults with layout overriding master', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, SAMPLE_MASTER_XML, SAMPLE_LAYOUT_XML);
      const merged = mergeShapeDefaults(context);

      // Layout overrides master's fontSize (18 vs 24)
      expect(merged.fontSize).toBe(18);
      // Layout overrides master's fontColor
      expect(merged.fontColor).toBe('#555555');
      // Master's fontFamily is preserved since layout doesn't define one
      expect(merged.fontFamily).toBe('Arial');
    });

    it('should apply slide overrides on top of everything', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, SAMPLE_MASTER_XML, SAMPLE_LAYOUT_XML);
      const merged = mergeShapeDefaults(context, { fontSize: 32, bold: true });

      expect(merged.fontSize).toBe(32);
      expect(merged.bold).toBe(true);
      // Other properties still inherited
      expect(merged.fontColor).toBe('#555555');
    });

    it('should use theme font as base default', () => {
      const context = resolveSlideContext(SAMPLE_THEME_XML, MINIMAL_MASTER_XML, MINIMAL_LAYOUT_XML);
      const merged = mergeShapeDefaults(context);

      expect(merged.fontFamily).toBe('Calibri'); // minorFont from theme
    });
  });
});
