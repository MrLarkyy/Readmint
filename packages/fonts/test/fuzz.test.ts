import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { glyfTableOf } from "../src/glyphClosure.js";
import {
  encodeWoff,
  FontRefused,
  MalformedFont,
  parseSfnt,
  subsetFont,
  type SfntFont,
} from "../src/index.js";
import { montserrat, parse } from "./testFonts.js";

const rounds = 2000;
const perRoundMs = 50;
const codePoints = [0x41, 0x56, 0x61, 0xe9];

/** Deterministic pseudo-random numbers (an LCG), so a failing round can be replayed. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state;
  };
}

/** Byte ranges of the file the exercised glyphs are read from: their glyf records, or the CFF table. */
function glyphRanges(bytes: Uint8Array): (readonly [start: number, end: number])[] {
  const font = parse(bytes);
  const at = (data: Uint8Array) => data.byteOffset - bytes.byteOffset;
  const inFile = (data: Uint8Array | undefined) =>
    data !== undefined && data.buffer === bytes.buffer && data.length > 0;
  if (font.outlines === "cff") {
    const cff = font.table("CFF ");
    return cff !== undefined && inFile(cff) ? [[at(cff), at(cff) + cff.length]] : [];
  }
  const glyf = glyfTableOf(font);
  return codePoints
    .map((codePoint) => glyf.data(font.glyphFor(codePoint)))
    .filter(inFile)
    .map((data) => [at(data), at(data) + data.length] as const);
}

/** A copy with a few bytes changed: in the headers and directories, inside the glyphs used, or anywhere. */
function mutate(
  bytes: Uint8Array,
  ranges: readonly (readonly [number, number])[],
  next: () => number,
): Uint8Array {
  const copy = bytes.slice();
  const flips = 1 + (next() % 8);
  for (let flip = 0; flip < flips; flip++) {
    const where = next() % 4;
    const range = ranges[next() % Math.max(1, ranges.length)];
    let position: number;
    if (where === 0) position = next() % copy.length;
    else if (where === 1 && range !== undefined)
      position = range[0] + (next() % (range[1] - range[0]));
    else position = next() % Math.min(copy.length, 2048);
    copy[position] = next() & 0xff;
  }
  return copy;
}

/** Everything a render does with a font, subset first; only `MalformedFont` or `FontRefused` may come out. */
function exercise(bytes: Uint8Array): void {
  const result = parseSfnt(bytes, { maxBytes: 1_000_000 });
  if (!result.ok) return;
  const font: SfntFont = result.font;
  const glyphs = new Map(codePoints.map((codePoint) => [codePoint, font.glyphFor(codePoint)]));
  try {
    encodeWoff(subsetFont(font, glyphs));
    for (const glyph of glyphs.values()) font.outline(glyph);
    font.kerning(glyphs.get(0x41) ?? 0, glyphs.get(0x56) ?? 0);
  } catch (error) {
    if (!(error instanceof MalformedFont) && !(error instanceof FontRefused)) throw error;
  }
}

describe.each(Object.entries(montserrat))("mutated Montserrat %s", (name, bytes) => {
  test(`${String(rounds)} mutations give a result or a font error, each quickly`, () => {
    const next = random(name.length * 7919);
    const ranges = glyphRanges(bytes);
    let slowest = 0;
    for (let round = 0; round < rounds; round++) {
      const mutated = mutate(bytes, ranges, next);
      const started = performance.now();
      try {
        exercise(mutated);
      } catch (error) {
        throw new Error(`round ${String(round)} threw ${String(error)}`);
      }
      slowest = Math.max(slowest, performance.now() - started);
    }
    expect(slowest).toBeLessThan(perRoundMs * loadScale());
  }, 300_000);
});

test("the glyph ranges of the TTF and the OTF lie inside the files", () => {
  for (const bytes of [montserrat.ttf, montserrat.otf]) {
    const ranges = glyphRanges(bytes);
    expect(ranges.length).toBeGreaterThan(0);
    for (const [, end] of ranges) expect(end).toBeLessThanOrEqual(bytes.length);
    expect(ranges[0]?.[0]).toBeGreaterThan(2048);
  }
});
