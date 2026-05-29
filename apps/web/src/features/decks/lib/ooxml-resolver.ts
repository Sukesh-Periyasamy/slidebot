// ─────────────────────────────────────────────────────────────────────────────
// OOXML Resolver — Resolves theme, master, and layout inheritance hierarchies
// ─────────────────────────────────────────────────────────────────────────────

import { XMLParser } from 'fast-xml-parser';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedTheme {
  colorScheme: Record<string, string>; // schemeClr name → #RRGGBB
  majorFont: string;
  minorFont: string;
}

export interface ShapeDefaults {
  [key: string]: string | number | boolean | undefined;
  fillColor?: string;     // #RRGGBB
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;     // #RRGGBB
  bold?: boolean;
  italic?: boolean;
}

export interface ResolvedSlideContext {
  theme: ResolvedTheme;
  masterDefaults: ShapeDefaults;
  layoutDefaults: ShapeDefaults;
}

// ─── XML Parser Configuration ────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

// ─── Color Scheme Parsing ────────────────────────────────────────────────────

/**
 * Standard OOXML theme color scheme element names.
 */
const SCHEME_COLOR_NAMES = [
  'dk1', 'lt1', 'dk2', 'lt2',
  'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
  'hlink', 'folHlink',
] as const;

/**
 * Extracts a 6-digit hex color value from a color element.
 * Handles both srgbClr and sysClr elements.
 */
function extractColorValue(colorElement: unknown): string | null {
  if (!colorElement || typeof colorElement !== 'object') {
    return null;
  }

  const el = colorElement as Record<string, unknown>;

  // srgbClr: direct RGB hex value
  if (el.srgbClr) {
    const srgb = el.srgbClr as Record<string, unknown>;
    const val = srgb['@_val'];
    if (typeof val === 'string' && /^[0-9A-Fa-f]{6}$/.test(val)) {
      return `#${val.toUpperCase()}`;
    }
  }

  // sysClr: system color with lastClr fallback
  if (el.sysClr) {
    const sys = el.sysClr as Record<string, unknown>;
    const lastClr = sys['@_lastClr'];
    if (typeof lastClr === 'string' && /^[0-9A-Fa-f]{6}$/.test(lastClr)) {
      return `#${lastClr.toUpperCase()}`;
    }
  }

  return null;
}

/**
 * Parses the color scheme from theme XML.
 * Extracts all 12 standard scheme colors and maps them to #RRGGBB values.
 */
function parseColorScheme(themeObj: Record<string, unknown>): Record<string, string> {
  const colorScheme: Record<string, string> = {};

  // Navigate to a:theme/a:themeElements/a:fmtScheme parent → a:clrScheme
  const theme = getNestedValue(themeObj, ['theme']);
  if (!theme) return colorScheme;

  const themeElements = getNestedValue(theme, ['themeElements']);
  if (!themeElements) return colorScheme;

  const clrScheme = getNestedValue(themeElements, ['clrScheme']);
  if (!clrScheme || typeof clrScheme !== 'object') return colorScheme;

  const scheme = clrScheme as Record<string, unknown>;

  for (const colorName of SCHEME_COLOR_NAMES) {
    const colorElement = scheme[colorName];
    if (colorElement) {
      const value = extractColorValue(colorElement);
      if (value) {
        colorScheme[colorName] = value;
      }
    }
  }

  return colorScheme;
}

// ─── Font Parsing ────────────────────────────────────────────────────────────

/**
 * Extracts the Latin font typeface from a font scheme element.
 */
function extractFontFamily(fontElement: unknown): string {
  if (!fontElement || typeof fontElement !== 'object') {
    return 'Calibri'; // Default OOXML font
  }

  const el = fontElement as Record<string, unknown>;
  const latin = el.latin as Record<string, unknown> | undefined;

  if (latin && typeof latin === 'object') {
    const typeface = latin['@_typeface'];
    if (typeof typeface === 'string' && typeface.length > 0) {
      return typeface;
    }
  }

  return 'Calibri';
}

/**
 * Parses major and minor font families from theme XML.
 */
function parseFonts(themeObj: Record<string, unknown>): { majorFont: string; minorFont: string } {
  const theme = getNestedValue(themeObj, ['theme']);
  if (!theme) return { majorFont: 'Calibri Light', minorFont: 'Calibri' };

  const themeElements = getNestedValue(theme, ['themeElements']);
  if (!themeElements) return { majorFont: 'Calibri Light', minorFont: 'Calibri' };

  const fontScheme = getNestedValue(themeElements, ['fontScheme']);
  if (!fontScheme || typeof fontScheme !== 'object') {
    return { majorFont: 'Calibri Light', minorFont: 'Calibri' };
  }

  const scheme = fontScheme as Record<string, unknown>;
  const majorFont = extractFontFamily(scheme.majorFont);
  const minorFont = extractFontFamily(scheme.minorFont);

  return { majorFont, minorFont };
}

// ─── Shape Defaults Parsing ──────────────────────────────────────────────────

/**
 * Extracts shape defaults from a slide master or layout XML.
 * Looks for default text and shape properties in the txStyles and spPr elements.
 */
function parseShapeDefaults(xmlObj: Record<string, unknown>): ShapeDefaults {
  const defaults: ShapeDefaults = {};

  // Try to find the root element (sldMaster or sldLayout)
  const root = getNestedValue(xmlObj, ['sldMaster']) ??
               getNestedValue(xmlObj, ['sldLayout']);

  if (!root || typeof root !== 'object') return defaults;

  const rootObj = root as Record<string, unknown>;

  // Extract default text style properties from txStyles
  const txStyles = getNestedValue(rootObj, ['txStyles']);
  if (txStyles && typeof txStyles === 'object') {
    const styles = txStyles as Record<string, unknown>;
    // bodyStyle contains default text properties
    const bodyStyle = styles.bodyStyle ?? styles.titleStyle ?? styles.otherStyle;
    if (bodyStyle) {
      extractTextDefaults(bodyStyle, defaults);
    }
  }

  // Extract default shape fill from cSld/spTree default properties
  const cSld = getNestedValue(rootObj, ['cSld']);
  if (cSld && typeof cSld === 'object') {
    const cSldObj = cSld as Record<string, unknown>;
    const spTree = getNestedValue(cSldObj, ['spTree']);
    if (spTree && typeof spTree === 'object') {
      const spTreeObj = spTree as Record<string, unknown>;
      // grpSpPr may contain default fill
      const grpSpPr = spTreeObj.grpSpPr;
      if (grpSpPr && typeof grpSpPr === 'object') {
        extractFillDefaults(grpSpPr as Record<string, unknown>, defaults);
      }
    }
  }

  return defaults;
}

/**
 * Extracts text-related defaults from a text style element.
 */
function extractTextDefaults(styleElement: unknown, defaults: ShapeDefaults): void {
  if (!styleElement || typeof styleElement !== 'object') return;

  const style = styleElement as Record<string, unknown>;

  // Look for defRPr (default run properties) at various levels
  const defRPr = style.defRPr ?? getNestedValue(style, ['lvl1pPr', 'defRPr']);

  if (defRPr && typeof defRPr === 'object') {
    const rPr = defRPr as Record<string, unknown>;

    // Font size (in hundredths of a point)
    const sz = rPr['@_sz'];
    if (typeof sz === 'string' || typeof sz === 'number') {
      const sizeValue = typeof sz === 'string' ? parseInt(sz, 10) : sz;
      if (!isNaN(sizeValue) && sizeValue > 0) {
        defaults.fontSize = sizeValue / 100; // Convert to points
      }
    }

    // Bold
    const b = rPr['@_b'];
    if (b === '1' || b === 'true' || b === true) {
      defaults.bold = true;
    }

    // Italic
    const i = rPr['@_i'];
    if (i === '1' || i === 'true' || i === true) {
      defaults.italic = true;
    }

    // Font color from solidFill
    const solidFill = rPr.solidFill;
    if (solidFill) {
      const color = extractColorValue(solidFill);
      if (color) {
        defaults.fontColor = color;
      }
    }

    // Font family from latin element
    const latin = rPr.latin as Record<string, unknown> | undefined;
    if (latin && typeof latin === 'object') {
      const typeface = latin['@_typeface'];
      if (typeof typeface === 'string' && typeface.length > 0 && !typeface.startsWith('+')) {
        defaults.fontFamily = typeface;
      }
    }
  }
}

/**
 * Extracts fill-related defaults from a shape properties element.
 */
function extractFillDefaults(spPr: Record<string, unknown>, defaults: ShapeDefaults): void {
  const solidFill = spPr.solidFill;
  if (solidFill) {
    const color = extractColorValue(solidFill);
    if (color) {
      defaults.fillColor = color;
    }
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

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

// ─── Main Resolver ───────────────────────────────────────────────────────────

/**
 * Resolves the slide context by parsing theme, master, and layout XML.
 *
 * The inheritance hierarchy is: Theme → Slide Master → Slide Layout → Slide
 * Most specific level wins; higher levels cascade as defaults.
 *
 * @param themeXml - Raw XML string of the theme file (ppt/theme/theme1.xml)
 * @param masterXml - Raw XML string of the slide master (ppt/slideMasters/slideMaster1.xml)
 * @param layoutXml - Raw XML string of the slide layout (ppt/slideLayouts/slideLayout1.xml)
 * @returns Resolved slide context with theme colors, fonts, and shape defaults
 */
export function resolveSlideContext(
  themeXml: string,
  masterXml: string,
  layoutXml: string
): ResolvedSlideContext {
  // Parse all XML documents
  const themeObj = xmlParser.parse(themeXml) as Record<string, unknown>;
  const masterObj = xmlParser.parse(masterXml) as Record<string, unknown>;
  const layoutObj = xmlParser.parse(layoutXml) as Record<string, unknown>;

  // Extract theme information
  const colorScheme = parseColorScheme(themeObj);
  const { majorFont, minorFont } = parseFonts(themeObj);

  // Extract shape defaults from master and layout
  const masterDefaults = parseShapeDefaults(masterObj);
  const layoutDefaults = parseShapeDefaults(layoutObj);

  // Apply inheritance: layout overrides master, which overrides theme defaults
  // The layout defaults already represent the most specific non-slide level
  // The master defaults represent the next level up
  // Consumers should apply: theme → master → layout → slide (most specific wins)

  return {
    theme: {
      colorScheme,
      majorFont,
      minorFont,
    },
    masterDefaults,
    layoutDefaults,
  };
}

/**
 * Resolves a scheme color reference to a concrete #RRGGBB value.
 *
 * @param schemeClrName - The scheme color name (e.g., 'accent1', 'dk1')
 * @param context - The resolved slide context containing the theme
 * @returns The resolved #RRGGBB color string, or null if not found
 */
export function resolveSchemeColor(
  schemeClrName: string,
  context: ResolvedSlideContext
): string | null {
  return context.theme.colorScheme[schemeClrName] ?? null;
}

/**
 * Resolves a font reference to a concrete font family name.
 *
 * @param fontRef - The font reference ('+mj-lt' for major, '+mn-lt' for minor, or a direct name)
 * @param context - The resolved slide context containing the theme
 * @returns The resolved font family name
 */
export function resolveFontReference(
  fontRef: string,
  context: ResolvedSlideContext
): string {
  if (fontRef === '+mj-lt' || fontRef === '+mj-ea' || fontRef === '+mj-cs') {
    return context.theme.majorFont;
  }
  if (fontRef === '+mn-lt' || fontRef === '+mn-ea' || fontRef === '+mn-cs') {
    return context.theme.minorFont;
  }
  // Direct font name
  return fontRef;
}

/**
 * Merges shape defaults following the inheritance hierarchy.
 * Most specific level wins (layout > master > theme defaults).
 *
 * @param context - The resolved slide context
 * @param slideOverrides - Optional slide-level property overrides
 * @returns Merged shape defaults with the most specific values
 */
export function mergeShapeDefaults(
  context: ResolvedSlideContext,
  slideOverrides?: Partial<ShapeDefaults>
): ShapeDefaults {
  // Start with theme-level defaults (font families from theme)
  const themeDefaults: ShapeDefaults = {
    fontFamily: context.theme.minorFont,
  };

  // Merge: theme → master → layout → slide (most specific wins)
  return {
    ...themeDefaults,
    ...stripUndefined(context.masterDefaults),
    ...stripUndefined(context.layoutDefaults),
    ...(slideOverrides ? stripUndefined(slideOverrides) : {}),
  };
}

/**
 * Removes undefined values from an object so spread doesn't override with undefined.
 */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T>) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}
