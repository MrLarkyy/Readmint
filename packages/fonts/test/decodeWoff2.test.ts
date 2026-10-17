import { brotliCompressSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { ByteWriter } from "../src/ByteWriter.js";
import { parseSfnt } from "../src/index.js";
import { mappedCodePoints, montserrat, parse, sameBytes } from "./testFonts.js";

/** A WOFF2 of one untransformed table (`head`, known tag 1) whose Brotli stream is `stream` compressed. */
function woff2(stream: Uint8Array, origLength: number): Uint8Array {
  const compressed = new Uint8Array(brotliCompressSync(stream));
  const out = new ByteWriter();
  out.tag("wOF2").u32(0x00010000).u32(0).u16(1).u16(0).u32(1024).u32(compressed.length);
  out.u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);
  out.u8(1);
  for (const byte of base128(origLength)) out.u8(byte);
  out.bytes(compressed);
  const bytes = out.result();
  new DataView(bytes.buffer).setUint32(8, bytes.length);
  return bytes;
}

function base128(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) {
    bytes.unshift((rest & 0x7f) | 0x80);
  }
  return bytes;
}

describe("WOFF2", () => {
  test("Montserrat WOFF2 gives the advances and outlines of the WOFF of the same TTF", () => {
    const fromWoff2 = parse(montserrat.woff2);
    const fromWoff = parse(montserrat.woff);
    expect(fromWoff2).toMatchObject({ container: "woff2", format: "ttf", outlines: "glyf" });
    expect(fromWoff2.numGlyphs).toBe(fromWoff.numGlyphs);
    for (let glyph = 0; glyph < fromWoff.numGlyphs; glyph++) {
      expect(fromWoff2.advanceOf(glyph)).toBe(fromWoff.advanceOf(glyph));
      expect(fromWoff2.bearingOf(glyph)).toBe(fromWoff.bearingOf(glyph));
      expect(fromWoff2.outline(glyph)).toEqual(fromWoff.outline(glyph));
    }
    expect(mappedCodePoints(fromWoff2)).toEqual(mappedCodePoints(fromWoff));
    for (const tag of ["cmap", "hmtx", "GPOS", "OS/2", "name"]) {
      expect(sameBytes(fromWoff2.table(tag), fromWoff.table(tag)), tag).toBe(true);
    }
  });

  test("a declared sfnt size past maxBytes is refused before decompressing", () => {
    const result = parseSfnt(montserrat.woff2, { maxBytes: 100_000 });
    expect(result).toMatchObject({ ok: false, kind: "too-large" });
  });

  test("a Brotli stream that decompresses past the declared size is malformed", () => {
    const input = woff2(new Uint8Array(5_000_000), 100);
    const { value, ms, scale } = timed(() => parseSfnt(input));
    expect(value).toMatchObject({ ok: false, kind: "malformed" });
    expect(ms).toBeLessThan(5000 * scale);
  });

  test("a truncated or damaged Brotli stream is malformed", () => {
    const truncated = montserrat.woff2.slice(0, 40_000);
    new DataView(truncated.buffer).setUint32(8, truncated.length);
    expect(parseSfnt(truncated)).toMatchObject({ ok: false, kind: "malformed" });
    const damaged = montserrat.woff2.slice();
    damaged.fill(0xa5, 2000, 2200);
    expect(parseSfnt(damaged)).toMatchObject({ ok: false, kind: "malformed" });
  });

  test("a stream shorter than the directory declares is malformed", () => {
    expect(parseSfnt(woff2(new Uint8Array(50), 100))).toMatchObject({
      ok: false,
      kind: "malformed",
    });
  });
});
