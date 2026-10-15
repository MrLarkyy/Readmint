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
import { bytesKey, sameBytes } from "../src/bytesKey.js";
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

/** FNV-1a state after `bytes`, from `state` (as bytesKey computes it). */
function fnv(bytes: Iterable<number>, state = 0x811c9dc5): number {
  let hash = state;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

function tail(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

/**
 * Two different fonts of one length whose content keys collide: the symbols font, and the same with the star's advance
 * widened, each followed by four bytes (outside every table) found by a birthday search over the tails.
 */
function collidingFonts(): [Uint8Array, Uint8Array] {
  const plain = readmintTestSymbols();
  const wide = plain.slice();
  const hmtx = readTableDirectory(new SfntReader(wide)).get("hmtx")?.offset ?? 0;
  new DataView(wide.buffer).setUint16(hmtx + 2 * 4, 900);
  const startPlain = fnv(plain);
  const startWide = fnv(wide);
  const seen = new Map<number, number>();
  for (let value = 0; value < 200_000; value++) seen.set(fnv(tail(value), startPlain), value);
  for (let value = 0; ; value++) {
    const match = seen.get(fnv(tail(value), startWide));
    if (match === undefined) continue;
    return [
      Uint8Array.from([...plain, ...tail(match)]),
      Uint8Array.from([...wide, ...tail(value)]),
    ];
  }
}

describe("the content key of supplied font bytes", () => {
  test("two different fonts whose keys collide each draw with their own font", () => {
    const [plain, wide] = collidingFonts();
    expect(bytesKey(plain)).toBe(bytesKey(wide));
    expect(sameBytes(plain, wide)).toBe(false);
    const fonts = {
      p: { family: "Readmint Test Symbols", src: "p.ttf", licence },
      w: { family: "Readmint Test Symbols", src: "w.ttf", licence },
    };
    const result = renderSvg(
      design(fonts, [
        { type: "text", content: "★★", font: "p", fontSize: 10 },
        { type: "text", y: 20, content: "★★", font: "w", fontSize: 10 },
      ]),
      { assets: { fonts: { p: plain, w: wide } } },
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const xs = [...result.svg.matchAll(/<tspan[^>]* x="([^"]*)"/gu)].map((match) => match[1]);
    expect(xs).toEqual(["0 7.8", "0 9"]);
    expect(result.report.fonts.map((font) => font.asset)).toEqual(["p", "w"]);
  });

  test("bytes over maxFontBytes are refused before they are hashed", () => {
    /** Throws when anything walks its bytes, as hashing does. */
    class Untouchable extends Uint8Array {
      override [Symbol.iterator](): never {
        throw new Error("the oversize bytes were hashed");
      }
    }
    const result = renderSvg(
      design({ f: { family: "Readmint Test Symbols", src: "f.ttf", licence } }, [
        { type: "text", content: "★", font: "f" },
      ]),
      { assets: { fonts: { f: new Untouchable(2000) } }, limits: { maxFontBytes: 1000 } },
    );
    expect(result).toMatchObject({
      ok: false,
      issues: [{ path: "/assets/fonts/f", code: "asset-too-large" }],
    });
  });
});
