import { shapeText, type ShapedRun, type ShapeOptions, type SfntFont } from "../src/index.js";
import { gdef, layoutTable, type TestFeature, type TestLookup } from "./buildLayoutTables.js";
import { buildTestFont, type TestGlyph } from "./buildTestFont.js";
import { parse } from "./testFonts.js";

/**
 * Glyphs of the layout test fonts: letters a-f and x (500 units), two combining marks (100 units, so zeroing shows),
 * and spare glyphs 9-13 lookups substitute in.
 */
export const glyph = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  acute: 6,
  grave: 7,
  x: 8,
  out1: 9,
  out2: 10,
  out3: 11,
  ligatureAb: 12,
  ligatureAbc: 13,
  f: 14,
} as const;

const glyphs: TestGlyph[] = [
  { advance: 500 },
  { codePoints: [0x61], advance: 500 },
  { codePoints: [0x62], advance: 500 },
  { codePoints: [0x63], advance: 500 },
  { codePoints: [0x64], advance: 500 },
  { codePoints: [0x65], advance: 500 },
  { codePoints: [0x0301], advance: 100 },
  { codePoints: [0x0300], advance: 100 },
  { codePoints: [0x78], advance: 500 },
  { advance: 510 },
  { advance: 520 },
  { advance: 530 },
  { advance: 900 },
  { advance: 1400 },
  { codePoints: [0x66], advance: 500 },
];

/** Classes of the test glyphs: marks 6 and 7, ligatures 12 and 13, bases the rest. */
export const testClasses: readonly (readonly [number, number])[] = glyphs.map((_, index) => [
  index,
  index === glyph.acute || index === glyph.grave
    ? 3
    : index === glyph.ligatureAb || index === glyph.ligatureAbc
      ? 2
      : 1,
]);

export interface LayoutFontOptions {
  readonly gsub?: {
    readonly features: readonly TestFeature[];
    readonly lookups: readonly TestLookup[];
  };
  readonly gpos?: {
    readonly features: readonly TestFeature[];
    readonly lookups: readonly TestLookup[];
  };
  readonly attachClasses?: readonly (readonly [number, number])[];
  readonly markSets?: readonly (readonly number[])[];
  /** Pairs of a legacy kern table. */
  readonly kern?: readonly (readonly [left: number, right: number, value: number])[];
  /** Raw tables, replacing the built ones. */
  readonly tables?: Readonly<Record<string, Uint8Array>>;
}

/** A test font with GDEF classes and the given GSUB and GPOS lookups (one script, DFLT). */
export function layoutFont(options: LayoutFontOptions): SfntFont {
  const tables: Record<string, Uint8Array> = {
    GDEF: gdef({
      classes: testClasses,
      ...(options.attachClasses === undefined ? {} : { attachClasses: options.attachClasses }),
      ...(options.markSets === undefined ? {} : { markSets: options.markSets }),
    }),
  };
  if (options.gsub !== undefined) {
    tables.GSUB = layoutTable(options.gsub.features, options.gsub.lookups);
  }
  if (options.gpos !== undefined) {
    tables.GPOS = layoutTable(options.gpos.features, options.gpos.lookups);
  }
  return parse(
    buildTestFont({
      family: "Layout Test",
      glyphs,
      tables: { ...tables, ...options.tables },
      ...(options.kern === undefined ? {} : { kern: options.kern }),
    }),
  );
}

/** Glyph ids of a shaped text. */
export function glyphsOf(font: SfntFont, text: string, options: ShapeOptions = {}): number[] {
  return [...shapeText(font, text, options).glyphs];
}

/** The shaped run of a text. */
export function shaped(font: SfntFont, text: string, options: ShapeOptions = {}): ShapedRun {
  return shapeText(font, text, options);
}
