import { expect, test } from "vitest";
import { readImageFile } from "../src/index.js";
import { testImages } from "./testImages.js";

/** A small seeded generator (mulberry32): the same mutations on every run. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `bytes` with a few bytes overwritten, cut short or grown with random bytes. */
function mutate(bytes: Uint8Array, next: () => number): Uint8Array {
  let out = bytes.slice();
  const flips = 1 + Math.floor(next() * 8);
  for (let index = 0; index < flips; index++) {
    out[Math.floor(next() * out.length)] = Math.floor(next() * 256);
  }
  const roll = next();
  if (roll < 0.25) out = out.subarray(0, Math.floor(next() * out.length));
  else if (roll < 0.4) {
    const grown = new Uint8Array(out.length + 16);
    grown.set(out);
    for (let index = out.length; index < grown.length; index++) {
      grown[index] = Math.floor(next() * 256);
    }
    out = grown;
  }
  return out;
}

test("reads the size, type and frames of every supported format", () => {
  expect(readImageFile(testImages.png.bytes)).toMatchObject({
    ok: true,
    info: { mime: "image/png", width: 24, height: 16, frames: 1 },
  });
  expect(readImageFile(testImages.gif.bytes)).toMatchObject({
    ok: true,
    info: { mime: "image/gif", frames: 2 },
  });
  expect(readImageFile(testImages.turnedJpeg.bytes)).toMatchObject({
    ok: true,
    info: { mime: "image/jpeg", width: 32, height: 16, orientation: 6 },
  });
});

test.each(["png", "jpeg", "gif", "webp"] as const)(
  "never throws for 1000 seeded mutations of the test %s",
  (kind) => {
    const next = random(0x52_4d_35_35);
    let refused = 0;
    for (let round = 0; round < 1000; round++) {
      const result = readImageFile(mutate(testImages[kind].bytes, next));
      if (!result.ok) {
        refused++;
        expect(result.message).toMatch(/^(cannot be used: |is |has more than )/u);
      }
    }
    // The mutations reach the refusals, not only bytes the sniffer never reads.
    expect(refused).toBeGreaterThan(0);
  },
);
