import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { encodeWoff, MalformedFont, parseSfnt, subsetFont } from "../src/index.js";
import { montserrat } from "./testFonts.js";

const rounds = 2000;
const perRoundMs = 50;

/** Deterministic pseudo-random numbers (an LCG), so a failing round can be replayed. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state;
  };
}

/** A copy with a few bytes changed: mostly in the headers and directories, sometimes anywhere. */
function mutate(bytes: Uint8Array, next: () => number): Uint8Array {
  const copy = bytes.slice();
  const flips = 1 + (next() % 8);
  for (let flip = 0; flip < flips; flip++) {
    const anywhere = next() % 4 === 0;
    const position = next() % (anywhere ? copy.length : Math.min(copy.length, 2048));
    copy[position] = next() & 0xff;
  }
  return copy;
}

/** Everything a render does with a font; only `MalformedFont` may come out of it. */
function exercise(bytes: Uint8Array): void {
  const result = parseSfnt(bytes, { maxBytes: 1_000_000 });
  if (!result.ok) return;
  const font = result.font;
  const glyphs = new Map<number, number>();
  for (const codePoint of [0x41, 0x56, 0x61, 0xe9]) glyphs.set(codePoint, font.glyphFor(codePoint));
  try {
    for (const glyph of glyphs.values()) font.outline(glyph);
    font.kerning(glyphs.get(0x41) ?? 0, glyphs.get(0x56) ?? 0);
    encodeWoff(subsetFont(font, glyphs));
  } catch (error) {
    if (!(error instanceof MalformedFont)) throw error;
  }
}

describe.each(Object.entries(montserrat))("mutated Montserrat %s", (name, bytes) => {
  test(`${String(rounds)} mutations give a result or MalformedFont, each quickly`, () => {
    const next = random(name.length * 7919);
    let slowest = 0;
    for (let round = 0; round < rounds; round++) {
      const mutated = mutate(bytes, next);
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
