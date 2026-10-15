import type { Design, FontAsset } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { buildTestFont, type TestPoint } from "../../fonts/test/buildTestFont.js";
import { renderSvg, type RenderOptions, type RenderResult } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const square = (x: number): TestPoint[] => [
  [x, 0, true],
  [x + 400, 0, true],
  [x + 400, 600, true],
  [x, 600, true],
];
const glyphs = [
  { advance: 500, contours: [square(50)] },
  { codePoints: [0x20], advance: 250 },
  { codePoints: [0x41], advance: 500, contours: [square(50)] },
  { codePoints: [0x2605], advance: 500, contours: [square(50)] },
];
const statement = 'Copyright 2026 The Rfn Authors, with Reserved Font Name "Rfn".';

/** Readmint test font "Rfn" whose copyright states a Reserved Font Name (`names` replaces the default records). */
function rfnFont(names: Readonly<Record<number, string | null>> = { 0: statement }): Uint8Array {
  return buildTestFont({ family: "Rfn", glyphs, names });
}

const rfnAsset = (extra: Partial<FontAsset> = {}): FontAsset => ({
  family: "Rfn",
  src: "fonts/r.ttf",
  licence: { embedding: "allowed" },
  ...extra,
});

function design(fonts: Record<string, FontAsset>, font = "r"): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 40 },
    assets: { fonts },
    layers: [
      { type: "text", content: "AA", font },
      { type: "text", y: 20, content: "A A", font },
    ],
  };
}

const supplied = (bytes = rfnFont()): RenderOptions => ({ assets: { fonts: { r: bytes } } });

function ok(result: RenderResult): Extract<RenderResult, { ok: true }> {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

function warnings(result: RenderResult): { path: string; code: string }[] {
  return ok(result).warnings.map(({ path, code }) => ({ path, code }));
}

function embedded(result: RenderResult): boolean {
  return ok(result).svg.includes("@font-face");
}

describe("a font with a Reserved Font Name is never embedded as a subset", () => {
  test("a name-table statement draws every text as paths, warning once at the asset", () => {
    const result = ok(renderSvg(design({ r: rfnAsset() }), supplied()));
    expect(result.warnings).toEqual([
      {
        path: "/assets/fonts/r",
        code: "font-reserved-name",
        message: expect.stringMatching(
          /^font asset "r" states a Reserved Font Name in its name table: its text is drawn as paths, the font is never embedded \(a subset is a Modified Version/u,
        ) as string,
      },
    ]);
    expect(result.svg).not.toContain("@font-face");
    expect(result.svg).not.toContain("data:font");
    expect(result.svg.match(/<path d="M[^"]+" fill-rule="nonzero" aria-label="/gu)).toHaveLength(2);
    expect(result.report.fonts).toEqual([
      // A and the space: distinct glyphs, however often they repeat.
      { asset: "r", bytes: expect.any(Number) as number, glyphs: 2, drawnAs: "paths" },
    ]);
    const asPaths = ok(renderSvg(design({ r: rfnAsset({ drawAs: "paths" }) }), supplied()));
    expect(asPaths.warnings).toEqual([]);
    expect(result.svg).toBe(asPaths.svg);
  });

  test("the same font without the statement is embedded", () => {
    const result = renderSvg(design({ r: rfnAsset() }), supplied(rfnFont({})));
    expect(warnings(result)).toEqual([]);
    expect(embedded(result)).toBe(true);
  });

  test("licence.reservedFontName true forces paths, warning at the option", () => {
    const medium = {
      ...fontAssets.medium,
      licence: { ...fontAssets.medium.licence, reservedFontName: true },
    };
    const result = renderSvg(design({ m: medium }, "m"));
    expect(warnings(result)).toEqual([
      { path: "/assets/fonts/m/licence/reservedFontName", code: "font-reserved-name" },
    ]);
    expect(embedded(result)).toBe(false);
    expect(ok(result).warnings[0]?.message).toContain(
      'font asset "m" declares a Reserved Font Name',
    );
  });

  test("licence.reservedFontName false embeds a font whose name table states one (written permission)", () => {
    const licence = { embedding: "allowed", reservedFontName: false } as const;
    const result = renderSvg(design({ r: rfnAsset({ licence }) }), supplied());
    expect(warnings(result)).toEqual([]);
    expect(embedded(result)).toBe(true);
  });

  test.each(["OFL-1.1-RFN", "OFL-1.0-RFN", "ofl-1.1-rfn"])(
    "the SPDX licence %s forces paths, warning at the licence name",
    (name) => {
      const medium = { ...fontAssets.medium, licence: { embedding: "allowed" as const, name } };
      const result = renderSvg(design({ m: medium }, "m"));
      expect(warnings(result)).toEqual([
        { path: "/assets/fonts/m/licence/name", code: "font-reserved-name" },
      ]);
      expect(embedded(result)).toBe(false);
    },
  );

  test.each(["OFL-1.1-no-RFN", "OFL-1.0-no-RFN"])(
    "the SPDX licence %s embeds a font whose name table states one",
    (name) => {
      const result = renderSvg(
        design({ r: rfnAsset({ licence: { embedding: "allowed", name } }) }),
        supplied(),
      );
      expect(warnings(result)).toEqual([]);
      expect(embedded(result)).toBe(true);
    },
  );

  test.each([
    ["another licence", { 0: statement, 13: "Licensed under the Example Font Licence.", 14: "" }],
    ["no licence records", { 0: statement, 13: null, 14: null }],
  ])("a statement counts in a font with %s, whatever licence the asset names", (_name, names) => {
    for (const licence of [
      { embedding: "allowed" },
      { embedding: "allowed", name: "OFL-1.1" },
    ] as const) {
      const result = renderSvg(design({ r: rfnAsset({ licence }) }), supplied(rfnFont(names)));
      expect(warnings(result)).toEqual([{ path: "/assets/fonts/r", code: "font-reserved-name" }]);
      expect(embedded(result)).toBe(false);
    }
  });

  test("drawAs paths draws a Reserved Font Name font as paths without a warning", () => {
    const result = renderSvg(design({ r: rfnAsset({ drawAs: "paths" }) }), supplied());
    expect(warnings(result)).toEqual([]);
    expect(embedded(result)).toBe(false);
  });

  test("a restricted font with a Reserved Font Name warns only that it is not embeddable", () => {
    const licence = { embedding: "restricted", reservedFontName: true } as const;
    const result = renderSvg(design({ r: rfnAsset({ licence }) }), supplied());
    expect(warnings(result)).toEqual([
      { path: "/assets/fonts/r/licence/embedding", code: "font-not-embeddable" },
    ]);
    expect(embedded(result)).toBe(false);
  });

  test("a Reserved Font Name fallback draws its texts as paths and warns once", () => {
    const fonts = { m: { ...fontAssets.medium, fallback: ["r"] }, r: rfnAsset() };
    const result = ok(
      renderSvg(
        {
          version: 0,
          canvas: { width: 100, height: 60 },
          assets: { fonts },
          layers: [
            { type: "text", content: "plain", font: "m" },
            { type: "text", y: 20, content: "star ★", font: "m" },
            { type: "text", y: 40, content: "★★", font: "m" },
          ],
        },
        supplied(),
      ),
    );
    expect(result.warnings.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "/assets/fonts/r", code: "font-reserved-name" },
    ]);
    expect(result.svg.match(/@font-face/gu)).toHaveLength(1);
    expect(result.svg).toContain('aria-label="star ★"');
    expect(result.report.fonts.map(({ asset, drawnAs }) => ({ asset, drawnAs }))).toEqual([
      { asset: "m", drawnAs: "font" },
      { asset: "r", drawnAs: "paths" },
    ]);
  });
});
