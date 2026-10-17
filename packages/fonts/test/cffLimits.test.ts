import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { FontRefused, OutlineBudget, parseSfnt, subsetFont, type SfntFont } from "../src/index.js";
import { expandingFont } from "./buildTestCff.js";

const first = 0x4e00;

function parse(bytes: Uint8Array): SfntFont {
  const result = parseSfnt(bytes);
  if (!result.ok) throw new Error(result.message);
  return result.font;
}

function codePoints(count: number): Map<number, number> {
  return new Map(Array.from({ length: count }, (_, index) => [first + index, index + 1]));
}

describe("CFF outline work and subset size are bounded per font", () => {
  const font = parse(expandingFont(300));

  test("one glyph stays under the per-glyph cap and outlines on its own", () => {
    expect(font.outline(1).length).toBeGreaterThan(700);
  });

  test("flattening 300 such glyphs through one budget stops with too-large, quickly", () => {
    const { value, ms, scale } = timed(() => {
      try {
        subsetFont(font, codePoints(300), { budget: new OutlineBudget() });
      } catch (error) {
        return error;
      }
      return undefined;
    });
    expect(value).toBeInstanceOf(FontRefused);
    // The refusal is the pin (without a budget all 300 glyphs flatten); the ceiling (some 25 x the time) only
    // catches a budget that stops far too late.
    expect(ms).toBeLessThan(5000 * scale);
  });

  test("the budget is shared: outlines read for paths count toward the subset", () => {
    const budget = new OutlineBudget();
    for (let glyph = 1; glyph <= 150; glyph++) font.outline(glyph, budget);
    expect(() => subsetFont(font, codePoints(100), { budget })).toThrow(FontRefused);
  });

  test("the subset stops at maxBytes while it is built", () => {
    let error: unknown;
    try {
      subsetFont(font, codePoints(10), { maxBytes: 50_000 });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(FontRefused);
    expect(error).toMatchObject({ kind: "too-large" });
  });
});

describe("CFF FontMatrix", () => {
  test("the default matrix with 1000 units per em is read", () => {
    expect(parseSfnt(expandingFont(1))).toMatchObject({ ok: true });
  });

  test("a matrix of 1/unitsPerEm is read", () => {
    expect(
      parseSfnt(expandingFont(1, 2000, ["0.0005", "0", "0", "0.0005", "0", "0"])),
    ).toMatchObject({
      ok: true,
    });
  });

  test.each([
    ["scaled", 1000, ["0.0005", "0", "0", "0.0005", "0", "0"]],
    ["default with 2048 units", 2048, undefined],
    ["skewed", 1000, ["0.001", "0", "0.0002", "0.001", "0", "0"]],
    ["moved", 1000, ["0.001", "0", "0", "0.001", "10", "0"]],
  ] as const)("a %s matrix is unsupported", (_name, unitsPerEm, matrix) => {
    expect(parseSfnt(expandingFont(1, unitsPerEm, matrix))).toMatchObject({
      ok: false,
      kind: "unsupported",
    });
  });
});
