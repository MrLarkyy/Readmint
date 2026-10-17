import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design, FontAsset } from "@readmint/format";
import { parseSfnt } from "@readmint/fonts";
import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { expandingFont } from "../../fonts/test/buildTestCff.js";
import { matchWeight } from "../src/loadFont.js";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const fontsDir = join(import.meta.dirname, "fonts");
const medium = new Uint8Array(readFileSync(join(fontsDir, "Montserrat-Medium.ttf")));

function design(fonts: Record<string, FontAsset>, layers: Design["layers"]): Design {
  return { version: 0, canvas: { width: 100, height: 40 }, assets: { fonts }, layers };
}

function withFsType(fsType: number): Uint8Array {
  const copy = medium.slice();
  const view = new DataView(copy.buffer);
  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + index * 16;
    if (String.fromCharCode(...copy.subarray(record, record + 4)) === "OS/2") {
      view.setUint16(view.getUint32(record + 8) + 8, fsType);
    }
  }
  return copy;
}

const pathFont = (family = "Montserrat"): FontAsset => ({
  family,
  src: "fonts/m.ttf",
  licence: { embedding: "allowed" },
});

const text = (font: string, extra: object = {}) => [
  { type: "text" as const, content: "Hi", font, ...extra },
];

/** What a restricted font must give: a successful render with paths, one warning and no font data. */
function expectPathsOnly(result: ReturnType<typeof renderSvg>, path: string): void {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  expect(result.warnings).toEqual([
    { path, code: "font-not-embeddable", message: expect.stringContaining('"m"') as string },
  ]);
  expect(result.svg).not.toContain("@font-face");
  expect(result.svg).not.toContain("data:font");
  expect(result.svg).not.toContain("<text");
  expect(result.svg).toMatch(/<path d="M[^"]+" fill-rule="nonzero" aria-label="Hi"/u);
  expect(result.report.fonts).toEqual([
    { asset: "m", bytes: expect.any(Number) as number, glyphs: 2, drawnAs: "paths" },
  ]);
}

describe("licence gate", () => {
  test("a font declared restricted is drawn as paths, never embedded, and the warning names it", () => {
    const result = renderSvg(
      design({ m: { ...fontAssets.medium, licence: { embedding: "restricted" } } }, text("m")),
    );
    expectPathsOnly(result, "/assets/fonts/m/licence/embedding");
  });

  test.each([0x0002, 0x0200, 0x0002 | 0x0008])(
    "fsType 0x%s forbids embedding even when the licence allows it",
    (fsType) => {
      const options: RenderOptions = { assets: { fonts: { m: withFsType(fsType) } } };
      expectPathsOnly(renderSvg(design({ m: pathFont() }, text("m")), options), "/assets/fonts/m");
    },
  );

  test("a restricted font warns once however many texts use it", () => {
    const result = renderSvg(
      design({ m: { ...fontAssets.medium, licence: { embedding: "restricted" } } }, [
        ...text("m"),
        ...text("m", { y: 20 }),
      ]),
    );
    expect(result.ok && result.warnings.map((warning) => warning.code)).toEqual([
      "font-not-embeddable",
    ]);
    expect(result.ok && result.svg.match(/<path /gu)).toHaveLength(2);
  });

  test("a restricted fallback is never embedded: every text that uses it is drawn as paths", () => {
    const fonts = {
      m: { ...fontAssets.medium, fallback: ["symbols"] },
      symbols: { ...fontAssets.symbols, licence: { embedding: "restricted" as const } },
    };
    const result = renderSvg(
      design(fonts, [
        { type: "text", content: "plain", font: "m" },
        { type: "text", y: 20, content: "star \u2605", font: "m" },
      ]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.svg.match(/@font-face/gu)).toHaveLength(1);
    expect(result.svg).toContain('aria-label="star \u2605"');
    expect(result.report.fonts).toEqual([
      { asset: "m", bytes: expect.any(Number) as number, glyphs: 9, drawnAs: "font" },
      { asset: "symbols", bytes: expect.any(Number) as number, glyphs: 1, drawnAs: "paths" },
    ]);
    const embedded = /url\((data:[^)]+)\)/u.exec(result.svg)?.[1] ?? "";
    expect(result.report.fonts[0]?.bytes).toBeGreaterThan(embedded.length);
  });

  test("drawAs paths draws a permitted font as paths without a warning", () => {
    const result = renderSvg(design({ m: { ...fontAssets.medium, drawAs: "paths" } }, text("m")));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
    expect(result.svg).not.toContain("@font-face");
    expect(result.svg).toContain("<path d=");
  });

  test("fsType 0 with an allowed licence embeds a WOFF subset of the supplied bytes", () => {
    const result = renderSvg(design({ m: pathFont() }, text("m")), {
      assets: { fonts: { m: medium } },
    });
    expect(result.ok && result.svg).toContain("src:url(data:font/woff;base64,d09GRgABAAA");
  });
});

describe("sources", () => {
  test("a path without supplied bytes is a missing asset", () => {
    expect(renderSvg(design({ m: pathFont() }, text("m")))).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m/src", code: "missing-asset" }],
    });
  });

  test("a font collection is unsupported and named", () => {
    const bytes = btoa(`ttcf${"\u0000".repeat(60)}`);
    const result = renderSvg(
      design({ w: { ...pathFont(), src: `data:font/ttf;base64,${bytes}` } }, text("w")),
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/w/src", code: "unsupported-font" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain('"w"');
  });

  test.each([
    ["wOFF", "font/woff"],
    ["wOF2", "font/woff2"],
  ])("a broken %s is an asset-format issue", (magic, mime) => {
    const bytes = btoa(`${magic}${"\u0000".repeat(60)}`);
    const result = renderSvg(
      design({ w: { ...pathFont(), src: `data:${mime};base64,${bytes}` } }, text("w")),
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/w/src", code: "asset-format" }],
    });
  });

  test.each([
    ["woff", fontAssets.woff],
    ["woff2", fontAssets.woff2],
    ["otf", fontAssets.otf],
  ])("a %s asset renders with a WOFF subset", (_name, asset) => {
    const result = renderSvg(design({ m: asset }, text("m")));
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.warnings).toEqual([]);
    expect(result.svg).toContain("src:url(data:font/woff;base64,");
  });

  test("a WOFF2 that decompresses past maxFontBytes is too large before decoding", () => {
    const result = renderSvg(design({ m: fontAssets.woff2 }, text("m")), {
      limits: { maxFontBytes: 100_000 },
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m", code: "asset-too-large" }],
    });
  });

  test("a malformed TTF is an issue, never a throw", () => {
    const options: RenderOptions = { assets: { fonts: { m: medium.subarray(0, 300) } } };
    expect(renderSvg(design({ m: pathFont() }, text("m")), options)).toMatchObject({
      ok: false,
      issues: [{ code: "asset-format" }],
    });
  });

  test("a data URI type that does not match the bytes is refused", () => {
    const src = fontAssets.medium.src.replace("data:font/ttf", "data:font/otf");
    expect(renderSvg(design({ m: { ...fontAssets.medium, src } }, text("m")))).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m/src", code: "asset-format" }],
    });
  });

  test("bytes over the cap are refused before parsing", () => {
    const options: RenderOptions = {
      assets: { fonts: { m: medium } },
      limits: { maxFontBytes: 1000 },
    };
    expect(renderSvg(design({ m: pathFont() }, text("m")), options)).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m", code: "asset-too-large" }],
    });
    expect(
      renderSvg(design({ m: fontAssets.medium }, text("m")), { limits: { maxFontBytes: 1000 } }),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m/src", code: "asset-too-large" }],
    });
  });
});

describe("selection and embedding", () => {
  const family = { medium: fontAssets.medium, bold: fontAssets.extraBold };

  test("the weight nearest by CSS rules is chosen and its weight emitted", () => {
    const result = renderSvg(design(family, text("medium", { fontWeight: 700 })));
    expect(result.ok && result.svg).toContain('font-weight="800"');
    expect(result.ok && result.svg.match(/@font-face/gu)).toHaveLength(1);
    expect(result.ok && result.report.fonts).toEqual([
      { asset: "bold", bytes: expect.any(Number) as number, glyphs: 2, drawnAs: "font" },
    ]);
  });

  test("without a fontWeight the referenced asset is used", () => {
    const result = renderSvg(design(family, text("bold")));
    expect(result.ok && result.svg).toContain('font-weight="800"');
  });

  test("unused and restricted-but-unused fonts are never embedded", () => {
    const result = renderSvg(
      design(
        {
          ...family,
          locked: { ...fontAssets.medium, family: "Other", licence: { embedding: "restricted" } },
        },
        text("medium"),
      ),
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.svg.match(/@font-face/gu)).toHaveLength(1);
    expect(result.ok && result.report.fonts.map((font) => font.asset)).toEqual(["medium"]);
  });

  test("regular and italic faces of one family each draw with their own style", () => {
    const fonts = { ...family, italic: { ...fontAssets.medium, style: "italic" as const } };
    const result = renderSvg(
      design(fonts, [
        { type: "text", content: "upright", font: "medium" },
        { type: "text", y: 20, content: "slanted", font: "italic" },
        { type: "text", y: 40, content: "slanted bold", font: "italic", fontWeight: 800 },
      ]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const texts = result.svg.match(/<text [^>]*>/gu) ?? [];
    expect(texts[0]).not.toContain("font-style");
    expect(texts[1]).toContain('font-weight="500" font-style="italic"');
    // Only italic faces are candidates for an italic text: the 800 face is upright, so the italic 500 is kept.
    expect(texts[2]).toContain('font-weight="500" font-style="italic"');
    const faces = result.svg.match(/@font-face\{[^}]*\}/gu) ?? [];
    expect(faces.map((face) => /font-style:(\w+)/u.exec(face)?.[1])).toEqual(["normal", "italic"]);
    expect(result.report.fonts.map((font) => font.asset)).toEqual(["medium", "italic"]);
  });

  test("a family that differs from the name inside the font is a warning", () => {
    const result = renderSvg(design({ m: { ...fontAssets.medium, family: "Monts" } }, text("m")));
    expect(result).toMatchObject({
      ok: true,
      warnings: [{ path: "/assets/fonts/m/family", code: "font-family-mismatch" }],
    });
    expect(renderSvg(design({ m: fontAssets.medium }, text("m")))).toMatchObject({
      ok: true,
      warnings: [],
    });
  });

  test.each([
    [400, [300, 500, 800], 500],
    [450, [300, 400, 600], 400],
    [500, [300, 600], 300],
    [300, [100, 400], 100],
    [300, [400, 500], 400],
    [700, [500, 800], 800],
    [900, [500, 800], 800],
    [600, [600], 600],
  ])("matchWeight(%i, %j) = %i", (desired, available, expected) => {
    expect(matchWeight(desired, available)).toBe(expected);
  });
});

/** Medium with the glyph of `codePoint` promising more contours than its bytes hold (review probe 3). */
function withBrokenGlyph(codePoint: number): Uint8Array {
  const copy = medium.slice();
  const parsed = parseSfnt(copy);
  if (!parsed.ok) throw new Error(parsed.message);
  const font = parsed.font;
  const glyf = font.table("glyf");
  const loca = font.table("loca");
  const head = font.table("head");
  if (glyf === undefined || loca === undefined || head === undefined) throw new Error("tables");
  const long = new DataView(head.buffer, head.byteOffset).getInt16(50) === 1;
  const locaView = new DataView(loca.buffer, loca.byteOffset);
  const glyph = font.glyphFor(codePoint);
  const at = (index: number) =>
    long ? locaView.getUint32(index * 4) : locaView.getUint16(index * 2) * 2;
  const length = at(glyph + 1) - at(glyph);
  new DataView(glyf.buffer, glyf.byteOffset + at(glyph)).setInt16(0, Math.floor(length / 2) + 10);
  return copy;
}

describe("fonts that turn out broken or costly when their glyphs are read", () => {
  test.each(["font", "paths"] as const)(
    "a glyph that promises more than it holds is asset-format, drawn as %s",
    (drawAs) => {
      const result = renderSvg(
        design({ m: { ...pathFont(), drawAs } }, text("m", { content: "B" })),
        {
          assets: { fonts: { m: withBrokenGlyph(0x42) } },
        },
      );
      expect(result).toMatchObject({
        ok: false,
        issues: [{ path: "/assets/fonts/m/src", code: "asset-format" }],
      });
    },
  );

  test.each(["font", "paths"] as const)(
    "CFF glyphs that expand through subroutines stop at the font's outline budget, drawn as %s",
    (drawAs) => {
      const content = Array.from({ length: 300 }, (_, index) =>
        String.fromCodePoint(0x4e00 + index),
      ).join("");
      const {
        value: result,
        ms,
        scale,
      } = timed(() =>
        renderSvg(
          design({ m: { ...pathFont("Heavy"), drawAs } }, text("m", { content })),
          // A budget this large lets the outline work, not the output size, be what stops the render.
          { assets: { fonts: { m: expandingFont(300) } }, limits: { maxOutputBytes: 100_000_000 } },
        ),
      );
      expect(result).toMatchObject({
        ok: false,
        issues: [{ path: "/assets/fonts/m", code: "asset-too-large" }],
      });
      // The asset-too-large is the pin (without the budget the render succeeds after many seconds); the ceiling,
      // some 10 x the time drawn as paths, only catches a budget that stops far too late.
      expect(ms).toBeLessThan(15_000 * scale);
    },
  );

  test.each(["font", "paths"] as const)(
    "the outline budget is the render's: fonts each under it but together over it stop, drawn as %s",
    (drawAs) => {
      const content = Array.from({ length: 110 }, (_, index) =>
        String.fromCodePoint(0x4e00 + index),
      ).join("");
      const heavy = expandingFont(110);
      const ids = ["f0", "f1", "f2", "f3"];
      const fonts = Object.fromEntries(ids.map((id) => [id, { ...pathFont("Heavy"), drawAs }]));
      const layers = ids.map((id, index) => ({
        type: "text" as const,
        y: index * 10,
        content,
        font: id,
      }));
      const options: RenderOptions = {
        assets: { fonts: Object.fromEntries(ids.map((id) => [id, heavy])) },
        limits: { maxOutputBytes: 100_000_000 },
      };
      expect(
        renderSvg(design({ f0: fonts.f0 ?? pathFont() }, layers.slice(0, 1)), options).ok,
      ).toBe(true);
      const {
        value: [result, again],
        ms,
        scale,
      } = timed(
        () =>
          [
            renderSvg(design(fonts, layers), options),
            renderSvg(design(fonts, layers), options),
          ] as const,
      );
      expect(result).toMatchObject({
        ok: false,
        issues: [{ path: "/assets/fonts/f1", code: "asset-too-large" }],
      });
      expect(again).toEqual(result);
      expect(ms).toBeLessThan(15_000 * scale);
    },
  );

  test("a CFF subset that could never fit the output budget stops while it is built", () => {
    const content = Array.from({ length: 10 }, (_, index) =>
      String.fromCodePoint(0x4e00 + index),
    ).join("");
    const result = renderSvg(design({ m: pathFont("Heavy") }, text("m", { content })), {
      assets: { fonts: { m: expandingFont(10) } },
      limits: { maxOutputBytes: 20_000 },
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m", code: "asset-too-large" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain("subset passes 80000 bytes");
  });

  test("a CFF font whose FontMatrix is not 1/unitsPerEm is an unsupported font", () => {
    const result = renderSvg(design({ m: pathFont("Heavy") }, text("m")), {
      assets: { fonts: { m: expandingFont(1, 1000, ["0.0005", "0", "0", "0.0005", "0", "0"]) } },
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m/src", code: "unsupported-font" }],
    });
  });
});
