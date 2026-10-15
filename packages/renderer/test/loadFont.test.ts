import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design, FontAsset } from "@readmint/format";
import { describe, expect, test } from "vitest";
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

describe("licence gate", () => {
  test("a font declared restricted is never embedded and the issue names the asset", () => {
    const result = renderSvg(
      design({ m: { ...fontAssets.medium, licence: { embedding: "restricted" } } }, text("m")),
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m/licence/embedding", code: "font-not-embeddable" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain('"m"');
  });

  test.each([0x0002, 0x0200, 0x0002 | 0x0008])(
    "fsType 0x%s forbids embedding even when the licence allows it",
    (fsType) => {
      const options: RenderOptions = { assets: { fonts: { m: withFsType(fsType) } } };
      const result = renderSvg(design({ m: pathFont() }, text("m")), options);
      expect(result).toMatchObject({
        ok: false,
        issues: [{ path: "/assets/fonts/m", code: "font-not-embeddable" }],
      });
    },
  );

  test("fsType 0 with an allowed licence embeds the supplied bytes", () => {
    const result = renderSvg(design({ m: pathFont() }, text("m")), {
      assets: { fonts: { m: medium } },
    });
    expect(result.ok && result.svg).toContain("src:url(data:font/ttf;base64,AAEAAA");
  });
});

describe("sources", () => {
  test("a path without supplied bytes is a missing asset", () => {
    expect(renderSvg(design({ m: pathFont() }, text("m")))).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/m/src", code: "missing-asset" }],
    });
  });

  test.each([
    ["wOFF", "font/woff"],
    ["wOF2", "font/woff2"],
    ["ttcf", "font/ttf"],
  ])("%s is unsupported and named", (magic, mime) => {
    const bytes = btoa(`${magic}${"\u0000".repeat(60)}`);
    const result = renderSvg(
      design({ w: { ...pathFont(), src: `data:${mime};base64,${bytes}` } }, text("w")),
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/w/src", code: "unsupported-font" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain('"w"');
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
      { asset: "bold", bytes: expect.any(Number) as number },
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

  test("every text asks for geometric precision so Chromium on Linux keeps fractional advances", () => {
    const result = renderSvg(
      design(family, [
        { type: "text", content: "one", font: "medium" },
        { type: "text", y: 20, content: "two", font: "medium" },
      ]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const texts = result.svg.match(/<text [^>]*>/gu) ?? [];
    expect(texts).toHaveLength(2);
    for (const text of texts) expect(text).toContain(' text-rendering="geometricPrecision"');
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
