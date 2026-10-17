import { zlibSync } from "fflate";
import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { ByteWriter } from "../src/ByteWriter.js";
import { decodeWoff } from "../src/decodeWoff.js";
import { encodeWoff, parseSfnt } from "../src/index.js";
import { MalformedFont } from "../src/MalformedFont.js";
import { mappedCodePoints, montserrat, parse, sameBytes } from "./testFonts.js";

/** A WOFF holding one table `tag` with `stored` bytes that claim to inflate to `origLength`. */
function woff(
  tag: string,
  stored: Uint8Array,
  origLength: number,
  totalSfntSize = 1024,
): Uint8Array {
  const out = new ByteWriter();
  const length = 44 + 20 + stored.length;
  out.tag("wOFF").u32(0x00010000).u32(length).u16(1).u16(0).u32(totalSfntSize);
  out.u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);
  out.tag(tag).u32(64).u32(stored.length).u32(origLength).u32(0);
  return out.bytes(stored).result();
}

describe("WOFF", () => {
  test("Montserrat WOFF gives the tables of the OTF of the same release", () => {
    const fromWoff = parse(montserrat.woff);
    const otf = parse(montserrat.otf);
    expect(fromWoff).toMatchObject({ container: "woff", format: "ttf", outlines: "glyf" });
    for (const tag of ["cmap", "GPOS", "GSUB"]) {
      expect(sameBytes(fromWoff.table(tag), otf.table(tag)), tag).toBe(true);
    }
    expect(mappedCodePoints(fromWoff)).toEqual(mappedCodePoints(otf));
    for (let glyph = 0; glyph < otf.numGlyphs; glyph++) {
      expect(fromWoff.advanceOf(glyph)).toBe(otf.advanceOf(glyph));
    }
  });

  test("encodeWoff and decodeWoff give back every table byte for byte", () => {
    const source = parse(montserrat.ttf);
    const decoded = parse(decodeWoff(encodeWoff(montserrat.ttf), 1_000_000));
    for (const tag of [
      "head",
      "hhea",
      "maxp",
      "OS/2",
      "hmtx",
      "cmap",
      "glyf",
      "loca",
      "GPOS",
      "name",
    ]) {
      expect(sameBytes(decoded.table(tag), source.table(tag)), tag).toBe(true);
    }
  });

  test("encodeWoff is deterministic and compresses", () => {
    const encoded = encodeWoff(montserrat.ttf);
    expect(sameBytes(encodeWoff(montserrat.ttf), encoded)).toBe(true);
    expect(encoded.length).toBeLessThan(montserrat.ttf.length * 0.7);
  });

  test("a table that inflates far past its declared size stops at the declared size", () => {
    const bomb = zlibSync(new Uint8Array(10_000_000), { level: 9, mem: 8 });
    expect(bomb.length).toBeLessThan(20_000);
    const input = woff("head", bomb, 1024);
    const { value, ms, scale } = timed(() => {
      try {
        decodeWoff(input, 4_000_000);
      } catch (error) {
        return error;
      }
      return undefined;
    });
    expect(value).toBeInstanceOf(MalformedFont);
    expect(ms).toBeLessThan(5000 * scale);
    expect(parseSfnt(woff("head", bomb, 1024))).toMatchObject({ ok: false, kind: "malformed" });
  });

  test("declared sizes past maxBytes are refused before anything is inflated", () => {
    const stored = zlibSync(new Uint8Array(100), { level: 9, mem: 8 });
    expect(parseSfnt(woff("head", stored, 10_000_000), { maxBytes: 1_000_000 })).toMatchObject({
      ok: false,
      kind: "too-large",
    });
    expect(parseSfnt(woff("head", stored, 100, 10_000_000), { maxBytes: 1_000_000 })).toMatchObject(
      { ok: false, kind: "too-large" },
    );
  });

  test("a table larger compressed than inflated is malformed", () => {
    const result = parseSfnt(woff("head", new Uint8Array(200), 100));
    expect(result).toMatchObject({ ok: false, kind: "malformed" });
    expect(result.ok ? "" : result.message).toContain("larger compressed");
  });

  test("a table that inflates to less than declared is malformed", () => {
    const stored = zlibSync(new Uint8Array(100), { level: 9, mem: 8 });
    expect(parseSfnt(woff("head", stored, 200))).toMatchObject({ ok: false, kind: "malformed" });
  });

  test("data that is not zlib is malformed", () => {
    expect(parseSfnt(woff("head", new Uint8Array(50).fill(7), 100))).toMatchObject({
      ok: false,
      kind: "malformed",
    });
  });
});
