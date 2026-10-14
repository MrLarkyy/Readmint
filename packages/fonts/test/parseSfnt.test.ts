import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { embeddingAllowed, parseSfnt, sniffFontFormat, type SfntFont } from "../src/index.js";

const fontsDir = join(import.meta.dirname, "..", "..", "renderer", "test", "fonts");
const medium = new Uint8Array(readFileSync(join(fontsDir, "Montserrat-Medium.ttf")));
const extraBold = new Uint8Array(readFileSync(join(fontsDir, "Montserrat-ExtraBold.ttf")));

function parse(bytes: Uint8Array): SfntFont {
  const result = parseSfnt(bytes);
  if (!result.ok) throw new Error(result.message);
  return result.font;
}

function tableOffset(bytes: Uint8Array, tag: string): { record: number; offset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + index * 16;
    const name = String.fromCharCode(...bytes.subarray(record, record + 4));
    if (name === tag) return { record, offset: view.getUint32(record + 8) };
  }
  throw new Error(`no ${tag}`);
}

function patched(bytes: Uint8Array, change: (view: DataView) => void): Uint8Array {
  const copy = bytes.slice();
  change(new DataView(copy.buffer));
  return copy;
}

describe("Montserrat", () => {
  test("metrics, weight, licence flags and family", () => {
    const font = parse(medium);
    expect(font).toMatchObject({
      format: "ttf",
      unitsPerEm: 1000,
      fsType: 0,
      weightClass: 500,
      familyName: "Montserrat",
    });
    expect(font.ascender).toBeGreaterThan(800);
    expect(font.descender).toBeLessThan(-150);
    expect(parse(extraBold)).toMatchObject({ weightClass: 800, familyName: "Montserrat" });
  });

  test("maps code points to glyphs with their advances", () => {
    const font = parse(medium);
    const a = font.glyphFor(0x41);
    const i = font.glyphFor(0x69);
    expect(a).toBeGreaterThan(0);
    expect(font.advanceOf(a)).toBeGreaterThan(font.advanceOf(i));
    expect(font.advanceOf(font.glyphFor(0x20))).toBeGreaterThan(0);
    expect(font.glyphFor(0x1f600)).toBe(0);
    expect(font.glyphFor(0x10ffff)).toBe(0);
    expect(font.advanceOf(font.numGlyphs + 100)).toBe(font.advanceOf(font.numGlyphs - 1));
  });

  test("the bold weight is wider", () => {
    const regular = parse(medium);
    const bold = parse(extraBold);
    const width = (font: SfntFont) =>
      Array.from("Readmint").reduce(
        (sum, char) => sum + font.advanceOf(font.glyphFor(char.codePointAt(0) ?? 0)),
        0,
      );
    expect(width(bold)).toBeGreaterThan(width(regular));
  });
});

describe("refused containers", () => {
  test.each([
    ["wOFF", "woff"],
    ["wOF2", "woff2"],
  ])("%s is unsupported until RM-14", (magic, format) => {
    const bytes = new Uint8Array(
      Array.from(magic, (char) => char.charCodeAt(0)).concat(Array(60).fill(0)),
    );
    expect(sniffFontFormat(bytes)).toBe(format);
    const result = parseSfnt(bytes);
    expect(result).toMatchObject({ ok: false, kind: "unsupported" });
    expect(result.ok ? "" : result.message).toContain("RM-14");
  });

  test("a collection is unsupported", () => {
    const bytes = new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 1, 0, 0]);
    expect(parseSfnt(bytes)).toMatchObject({ ok: false, kind: "unsupported" });
  });

  test("unknown bytes are not a font", () => {
    expect(parseSfnt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]))).toMatchObject({
      ok: false,
      kind: "malformed",
    });
    expect(parseSfnt(new Uint8Array([0, 1]))).toMatchObject({ ok: false, kind: "malformed" });
  });
});

describe("crafted fonts give a problem, never a throw", () => {
  test("truncated files at many lengths", () => {
    for (const length of [4, 12, 100, 400, 1000, 5000, 50_000, medium.length - 1]) {
      const result = parseSfnt(medium.subarray(0, length));
      if (result.ok) {
        // A cut inside glyph outlines leaves every table the reader needs intact.
        expect(length).toBeGreaterThan(50_000);
      } else {
        expect(result.kind).toBe("malformed");
      }
    }
  });

  test("a table that lies past the end", () => {
    const { record } = tableOffset(medium, "cmap");
    const bytes = patched(medium, (view) => {
      view.setUint32(record + 12, 0x7fffffff);
    });
    expect(parseSfnt(bytes)).toMatchObject({ ok: false, kind: "malformed" });
  });

  test("a huge table count", () => {
    const bytes = patched(medium, (view) => {
      view.setUint16(4, 0xffff);
    });
    const result = parseSfnt(bytes);
    expect(result).toMatchObject({ ok: false, kind: "malformed" });
    expect(result.ok ? "" : result.message).toContain("65535 tables");
  });

  test("a cmap subtable offset past the end", () => {
    const { offset } = tableOffset(medium, "cmap");
    const bytes = patched(medium, (view) => {
      view.setUint32(offset + 8, 0x7ffffff0);
    });
    expect(parseSfnt(bytes)).toMatchObject({ ok: false, kind: "malformed" });
  });

  test("an hmtx shorter than hhea declares", () => {
    const { offset } = tableOffset(medium, "hhea");
    const bytes = patched(medium, (view) => {
      view.setUint16(offset + 34, 0xffff);
    });
    expect(parseSfnt(bytes)).toMatchObject({ ok: false, kind: "malformed" });
  });

  test("random byte noise over the tables", () => {
    let seed = 7;
    for (let round = 0; round < 50; round++) {
      const bytes = medium.slice();
      for (let flip = 0; flip < 200; flip++) {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        bytes[seed % 4000] = seed & 0xff;
      }
      const result = parseSfnt(bytes);
      if (result.ok) result.font.glyphFor(0x41);
    }
  });
});

describe("embedding flags", () => {
  test.each([
    [0x0000, true],
    [0x0004, true],
    [0x0008, true],
    [0x0002, false],
    [0x0200, false],
    [0x0002 | 0x0004, false],
  ])("fsType %i embeddable: %s", (fsType, allowed) => {
    expect(embeddingAllowed(fsType)).toBe(allowed);
  });

  test("a patched copy reports the restricted fsType", () => {
    const { offset } = tableOffset(medium, "OS/2");
    for (const fsType of [0x0002, 0x0200]) {
      const font = parse(
        patched(medium, (view) => {
          view.setUint16(offset + 8, fsType);
        }),
      );
      expect(font.fsType).toBe(fsType);
      expect(embeddingAllowed(font.fsType)).toBe(false);
    }
  });
});
