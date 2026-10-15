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
import { readTableDirectory } from "../src/readTableDirectory.js";
import { SfntReader } from "../src/SfntReader.js";
import { shapeTextCounted } from "../src/shapeText.js";
import { montserrat, noto, parse } from "./testFonts.js";

const rounds = 2000;
/**
 * A ceiling, not a speed target: a round takes some 2 to 30 ms, the unbounded work this catches took seconds (the
 * round-1 kerning reader 43 s). Wide enough that a loaded machine never trips it.
 */
const perRoundCeilingMs = 1000;
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
    expect(slowest).toBeLessThan(perRoundCeilingMs * loadScale());
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

const layoutTags = ["GDEF", "GSUB", "GPOS"];
const layoutRounds = 1000;
/** Fixed strings per font: ligatures, kerning, joining, marks, syllables and reordering get exercised. */
const layoutTexts: readonly (readonly [Uint8Array, string, readonly string[]])[] = [
  [montserrat.ttf, "Montserrat", ["office AV To fi\u0301", "Wa\u0300 ffl"]],
  [
    noto.arabic,
    "Naskh",
    [
      "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
      "\u0628\u0650\u0633\u0652\u0645\u0650 \u0644\u0627",
    ],
  ],
  [
    noto.devanagari,
    "Devanagari",
    ["\u0939\u093f\u0928\u094d\u0926\u0940 \u0915\u094d\u0937", "\u0930\u094d\u0915\u093f \u093f"],
  ],
];

/** Byte ranges of the layout tables in the file. */
function layoutRanges(bytes: Uint8Array): (readonly [start: number, end: number])[] {
  const reader = new SfntReader(bytes);
  return [...readTableDirectory(reader)]
    .filter(([tag]) => layoutTags.includes(tag))
    .map(([, table]) => [table.offset, table.offset + table.length] as const);
}

/** A copy with a few bytes of its layout tables changed. */
function mutateLayout(
  bytes: Uint8Array,
  ranges: readonly (readonly [number, number])[],
  next: () => number,
): Uint8Array {
  const copy = bytes.slice();
  const flips = 1 + (next() % 6);
  for (let flip = 0; flip < flips; flip++) {
    const range = ranges[next() % ranges.length];
    if (range === undefined) continue;
    // Headers and lists sit at the start of a table: bias a third of the flips there.
    const span = next() % 3 === 0 ? Math.min(64, range[1] - range[0]) : range[1] - range[0];
    copy[range[0] + (next() % span)] = next() & 0xff;
  }
  return copy;
}

describe.each(layoutTexts)("mutated layout tables of %s", (bytes, name, texts) => {
  test(`${String(layoutRounds)} mutations shape or fail as a font error, within the operation budget`, () => {
    const next = random(name.length * 104_729);
    const ranges = layoutRanges(bytes);
    expect(ranges.length).toBe(3);
    let slowest = 0;
    let failures = 0;
    for (let round = 0; round < layoutRounds; round++) {
      const result = parseSfnt(mutateLayout(bytes, ranges, next), { maxBytes: 1_000_000 });
      if (!result.ok) continue;
      const started = performance.now();
      for (const text of texts) {
        for (const rtl of [false, true]) {
          try {
            const { run, operations, maxOperations } = shapeTextCounted(result.font, text, { rtl });
            expect(operations).toBeLessThanOrEqual(maxOperations);
            expect(run.glyphs.length).toBe(run.advances.length);
          } catch (error) {
            if (!(error instanceof MalformedFont)) {
              throw new Error(`round ${String(round)} threw ${String(error)}`);
            }
            failures++;
          }
        }
      }
      slowest = Math.max(slowest, performance.now() - started);
    }
    expect(failures).toBeLessThan(layoutRounds * texts.length * 2);
    expect(slowest).toBeLessThan(perRoundCeilingMs * loadScale());
  }, 300_000);
});
