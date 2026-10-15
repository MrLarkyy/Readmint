import { encodeWoff } from "@readmint/fonts";
import type { Design, FontAsset, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { buildTestFont, type TestPoint } from "../../fonts/test/buildTestFont.js";
import { readmintTestSymbols } from "../../fonts/test/readmintTestSymbols.js";
import { readTableDirectory } from "../../fonts/src/readTableDirectory.js";
import { SfntReader } from "../../fonts/src/SfntReader.js";
import { TRUETYPE_FLAVOR } from "../../fonts/src/sfntFlavor.js";
import { writeSfnt } from "../../fonts/src/writeSfnt.js";
import { RenderLimits, renderSvg, type RenderOptions } from "../src/index.js";

const licence = { embedding: "allowed" } as const;

/**
 * Review probe 11: the symbols font plus a 3.9 MB table of zeros, as a 4.8 kB WOFF. `variant` changes one byte of the
 * zeros, so each variant is a different source the renderer cannot share.
 */
function woffBomb(variant: number): Uint8Array {
  const symbols = readmintTestSymbols();
  const reader = new SfntReader(symbols);
  const tables = new Map<string, Uint8Array>();
  for (const [tag, table] of readTableDirectory(reader)) {
    tables.set(tag, reader.slice(table.offset, table.length));
  }
  const zeros = new Uint8Array(3_900_000);
  zeros[0] = variant;
  tables.set("zzzz", zeros);
  return encodeWoff(writeSfnt(TRUETYPE_FLAVOR, tables, false));
}

function design(fonts: Record<string, FontAsset>, layers: Layer[]): Design {
  return { version: 0, canvas: { width: 100, height: 40 }, assets: { fonts }, layers };
}

function bombs(count: number, variants: number): { design: Design; options: RenderOptions } {
  const sources = Array.from({ length: variants }, (_, variant) => woffBomb(variant));
  const fonts: Record<string, FontAsset> = {};
  const supplied: Record<string, Uint8Array> = {};
  const layers: Layer[] = [];
  for (let index = 0; index < count; index++) {
    const id = `f${String(index)}`;
    fonts[id] = { family: "Readmint Test Symbols", src: `${id}.woff`, licence };
    supplied[id] = sources[index % variants] ?? new Uint8Array(0);
    layers.push({ type: "text", content: "★", font: id, fontSize: 10 });
  }
  return { design: design(fonts, layers), options: { assets: { fonts: supplied } } };
}

describe("decoded font bytes are bounded per render, not per asset", () => {
  test("the default allows four fonts at the per-font limit", () => {
    expect(RenderLimits.maxTotalFontBytes).toBe(4 * RenderLimits.maxFontBytes);
  });

  test("small WOFF bombs, each under the per-font limit, stop at the asset that crosses the total", () => {
    const { design: many, options } = bombs(400, 6);
    const started = performance.now();
    const result = renderSvg(many, options);
    // 3.9 MB each: four fit in 16 MiB, the fifth (f4) crosses before it inflates.
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/f4", code: "asset-too-large" }],
    });
    expect(result.ok ? "" : result.issues[0]?.message).toContain("maxTotalFontBytes");
    expect(renderSvg(many, options)).toEqual(result);
    // The refusal is the pin (before, all 400 decoded: 9.5 s, 1.5 GB); the ceiling only catches a late stop.
    expect(performance.now() - started).toBeLessThan(10_000 * loadScale());
  });

  test("assets sharing one source decode it once and count it once", () => {
    const { design: shared, options } = bombs(400, 1);
    const result = renderSvg(shared, options);
    expect(result.ok).toBe(true);
    expect(result.ok && result.report.fonts).toHaveLength(400);
  });

  test("equal bytes in distinct arrays (any caller) decode once and count once", () => {
    const one = woffBomb(0);
    const { design: copies } = bombs(400, 1);
    const supplied = Object.fromEntries(
      Array.from({ length: 400 }, (_, index) => [`f${String(index)}`, one.slice()]),
    );
    expect(supplied["f0"]).not.toBe(supplied["f1"]);
    expect(renderSvg(copies, { assets: { fonts: supplied } }).ok).toBe(true);
  });

  test("the same holds for one data URI used by many assets", () => {
    const src = `data:font/woff;base64,${Buffer.from(woffBomb(0)).toString("base64")}`;
    const fonts = Object.fromEntries(
      Array.from({ length: 50 }, (_, index) => [
        `f${String(index)}`,
        { family: "Readmint Test Symbols", src, licence },
      ]),
    );
    const layers = Object.keys(fonts).map((id) => ({
      type: "text" as const,
      content: "★",
      font: id,
    }));
    expect(renderSvg(design(fonts, layers)).ok).toBe(true);
  });

  test("a lower maxTotalFontBytes refuses a plain TTF before parsing it", () => {
    const { design: one, options } = bombs(1, 1);
    const ttf = readmintTestSymbols();
    const result = renderSvg(one, {
      assets: { fonts: { f0: ttf } },
      limits: { maxTotalFontBytes: ttf.length - 1 },
    });
    expect(options.assets?.fonts?.["f0"]).toBeDefined();
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/f0", code: "asset-too-large" }],
    });
  });
});

describe("font subsets are bounded per render, not per subset", () => {
  /** One glyph of 60000 points (some 300 kB of glyf data that compresses to almost nothing) at U+0041. */
  function bigGlyphFont(): Uint8Array {
    const points: TestPoint[] = Array.from({ length: 60_000 }, () => [0, 0, true] as const);
    return buildTestFont({
      family: "Big",
      glyphs: [{ advance: 500 }, { codePoints: [0x41], advance: 600, contours: [points] }],
    });
  }

  test("many assets of one font each embedding its big glyph stop at four times the output budget", () => {
    const font = bigGlyphFont();
    const ids = Array.from({ length: 100 }, (_, index) => `f${String(index)}`);
    const fonts = Object.fromEntries(
      ids.map((id) => [id, { family: "Big", src: `${id}.ttf`, licence }]),
    );
    const layers = ids.map((id) => ({ type: "text" as const, content: "A", font: id }));
    const options: RenderOptions = {
      assets: { fonts: Object.fromEntries(ids.map((id) => [id, font])) },
    };
    const result = renderSvg(design(fonts, layers), options);
    // 300 kB a subset against 4 x 5 MiB: the 70th subset (f69) crosses.
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/f69", code: "asset-too-large" }],
    });
    const fewer = design(
      Object.fromEntries(
        ids.slice(0, 10).map((id) => [id, { family: "Big", src: `${id}.ttf`, licence }]),
      ),
      layers.slice(0, 10),
    );
    expect(renderSvg(fewer, options).ok).toBe(true);
  });
});
