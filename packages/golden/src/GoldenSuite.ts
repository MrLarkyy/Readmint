import type { GoldenTolerance } from "./GoldenTolerance.js";

export interface GoldenFixture<I> {
  name: string;
  input: I;
  /** Raster zoom for the PNG golden, 1..4. */
  scale?: number;
}

export interface GoldenSuite<I> {
  name: string;
  render: (input: I) => string | Promise<string>;
  fixtures: GoldenFixture<I>[];
  tolerance?: Partial<GoldenTolerance>;
  browserTolerance?: Partial<GoldenTolerance>;
  /** TTF/OTF files resvg may draw text with; system fonts are never loaded. Required when a fixture has text. */
  fonts?: string[];
  /**
   * The fonts resvg draws a rendered SVG's text with, taken from the SVG itself (its embedded subsets, decoded to
   * TTF/OTF): used instead of `fonts` when given, for text whose shaped glyphs only the subsets map.
   */
  fontsFromSvg?: (svg: string) => readonly Uint8Array[];
  /** Decimal places kept in normalized SVG numbers, default 3. */
  precision?: number;
}

export const goldenNamePattern = /^[a-z0-9][a-z0-9-]*$/;

export function defineGoldenSuite<I>(suite: GoldenSuite<I>): GoldenSuite<I> {
  assertName("suite", suite.name);
  if (suite.fixtures.length === 0) throw new Error(`golden suite ${suite.name} has no fixtures`);
  const seen = new Set<string>();
  for (const fixture of suite.fixtures) {
    assertName("fixture", fixture.name);
    if (seen.has(fixture.name))
      throw new Error(`golden suite ${suite.name} repeats fixture ${fixture.name}`);
    seen.add(fixture.name);
    const scale = fixture.scale ?? 1;
    if (!Number.isFinite(scale) || scale < 1 || scale > 4) {
      throw new RangeError(
        `golden fixture ${fixture.name} scale must be between 1 and 4, got ${String(scale)}`,
      );
    }
  }
  const precision = suite.precision;
  if (
    precision !== undefined &&
    !(Number.isInteger(precision) && precision >= 0 && precision <= 8)
  ) {
    throw new RangeError(`golden suite ${suite.name} precision must be an integer from 0 to 8`);
  }
  return suite;
}

function assertName(kind: string, name: string): void {
  if (!goldenNamePattern.test(name)) {
    throw new Error(
      `golden ${kind} name ${JSON.stringify(name)} must match ${String(goldenNamePattern)}`,
    );
  }
}
