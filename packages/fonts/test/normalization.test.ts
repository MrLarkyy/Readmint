import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { shapeTextCounted } from "../src/shapeText.js";
import {
  maxReorderedMarks,
  normalizeCharacters,
  normalizeText,
} from "../src/normalizeCharacters.js";
import { decompositionOf } from "../src/unicode/canonicalDecomposition.js";
import { combiningClassOf, modifiedCombiningClassOf } from "../src/unicode/combiningClass.js";
import { normalizeForFont, normalizeNfc } from "../src/index.js";
import { montserrat, parse } from "./testFonts.js";

const sample = readFileSync(
  join(import.meta.dirname, "data", "NormalizationTest-sample.txt"),
  "utf8",
);
const tests = sample
  .split("\n")
  .filter((line) => line !== "" && !line.startsWith("#") && !line.startsWith("@"))
  .map((line) =>
    line
      .split(";")
      .slice(0, 5)
      .map((field) => field.split(" ").map((hex) => Number.parseInt(hex, 16))),
  );

/** A font with every character that has no canonical decomposition: normalization gives NFD. */
const decomposedFont = (codePoint: number) => decompositionOf(codePoint) === undefined;
/** A font with every character but the singleton-decomposable ones: normalization gives NFC. */
const composedFont = (codePoint: number) => decompositionOf(codePoint)?.length !== 1;
const font = (...codePoints: number[]) => {
  const mapped = new Set(codePoints);
  return (codePoint: number) => mapped.has(codePoint);
};

function normalize(
  codePoints: readonly number[],
  maps: (codePoint: number) => boolean,
  order: "canonical" | "font" = "canonical",
): number[] {
  return normalizeCharacters(codePoints, new Array<number>(codePoints.length).fill(0), maps, order)
    .codePoints;
}

const hex = (codePoints: readonly number[]) =>
  codePoints.map((codePoint) => codePoint.toString(16).toUpperCase().padStart(4, "0")).join(" ");

test("the NormalizationTest sample: a font without composites gives NFD, one with all of them NFC", () => {
  expect(tests.length).toBeGreaterThan(2000);
  const failures: string[] = [];
  for (const [c1 = [], c2 = [], c3 = [], c4 = [], c5 = []] of tests) {
    const check = (source: number[], maps: (codePoint: number) => boolean, expected: number[]) => {
      const actual = normalize(source, maps);
      if (hex(actual) !== hex(expected)) {
        failures.push(`${hex(source)}: ${hex(actual)}, expected ${hex(expected)}`);
      }
    };
    for (const source of [c1, c2, c3]) {
      check(source, decomposedFont, c3);
      check(source, composedFont, c2);
    }
    for (const source of [c4, c5]) {
      check(source, decomposedFont, c5);
      check(source, composedFont, c4);
    }
  }
  expect(failures.slice(0, 20)).toEqual([]);
});

test("a singleton decomposition keeps the character when the font maps it", () => {
  expect(normalize([0x212b], font(0x212b, 0xc5, 0x41, 0x30a))).toEqual([0x212b]);
  expect(normalize([0x212b], font(0xc5, 0x41, 0x30a))).toEqual([0xc5]);
  expect(normalize([0x212b], font(0x41, 0x30a))).toEqual([0x41, 0x30a]);
  expect(normalize([0xf900], font(0xf900))).toEqual([0xf900]);
  expect(normalize([0xf900], font(0x8c48))).toEqual([0x8c48]);
});

test("composition goes as far as the font maps composites", () => {
  const source = [0x65, 0x323, 0x302];
  expect(normalize(source, font(0x65, 0x323, 0x302, 0x1eb9, 0x1ec7))).toEqual([0x1ec7]);
  expect(normalize(source, font(0x65, 0x323, 0x302, 0x1eb9))).toEqual([0x1eb9, 0x302]);
  expect(normalize(source, font(0x65, 0x323, 0x302))).toEqual(source);
  // Every canonically equivalent spelling gives the same characters.
  const maps = font(0x65, 0x301, 0x323, 0xe9, 0x1eb9);
  const spellings = [
    [0xe9, 0x323],
    [0x1eb9, 0x301],
    [0x65, 0x323, 0x301],
    [0x65, 0x301, 0x323],
  ];
  for (const spelling of spellings) {
    expect(normalize(spelling, maps, "font")).toEqual([0x1eb9, 0x301]);
  }
});

test("font order puts shadda before fatha; canonical order keeps Unicode's classes", () => {
  expect(normalize([0x628, 0x64e, 0x651], decomposedFont, "font")).toEqual([0x628, 0x651, 0x64e]);
  expect(normalize([0x628, 0x651, 0x64e], decomposedFont, "font")).toEqual([0x628, 0x651, 0x64e]);
  expect(normalize([0x628, 0x651, 0x64e], decomposedFont)).toEqual([0x628, 0x64e, 0x651]);
});

test("the modified combining classes give each class a key of its own", () => {
  const keys = new Map<number, number>();
  for (let codePoint = 0; codePoint < 0x110000; codePoint++) {
    const combining = combiningClassOf(codePoint);
    if (combining === 0 || keys.has(combining)) continue;
    if (codePoint === 0x1a60 || codePoint === 0x0fc6 || codePoint === 0x0f39) continue;
    keys.set(combining, modifiedCombiningClassOf(codePoint));
  }
  expect(keys.size).toBeGreaterThan(50);
  expect(new Set(keys.values()).size).toBe(keys.size);
  expect([...keys.values()].every((key) => key > 0)).toBe(true);
});

test("a run of more than 32 non-starters stays as written; 32 are put in order", () => {
  const maps = font(0x61, 0x301, 0x323);
  const marks = (count: number) =>
    Array.from({ length: count }, (_, index) => (index % 2 === 0 ? 0x301 : 0x323));
  const sorted = normalize([0x61, ...marks(maxReorderedMarks)], maps);
  expect(sorted).toEqual([
    0x61,
    ...new Array<number>(16).fill(0x323),
    ...new Array<number>(16).fill(0x301),
  ]);
  const long = [0x61, ...marks(maxReorderedMarks + 1)];
  expect(normalize(long, maps)).toEqual(long);
});

test("normalization takes at most 70 steps per code point, the same on every call", () => {
  const alternating = [
    0x61,
    ...Array.from({ length: 100_000 }, (_, index) => (index % 2 === 0 ? 0x323 : 0x301)),
  ];
  const dialytika = new Array<number>(100_000).fill(0x344);
  const syllables = Array.from({ length: 50_000 }, (_, index) => 0xac01 + (index % 11_000));
  const everything = () => true;
  for (const source of [alternating, dialytika, syllables]) {
    for (const clusters of [new Array<number>(source.length).fill(0), source.map((_, i) => i)]) {
      const first = normalizeCharacters(source, clusters, everything);
      expect(first.steps).toBeLessThanOrEqual(70 * source.length);
      expect(normalizeCharacters(source, clusters, everything)).toEqual(first);
    }
    const text = String.fromCodePoint(...source.slice(0, 50_000));
    const clustered = normalizeText(text, decomposedFont);
    expect(clustered.steps).toBeLessThanOrEqual(70 * 50_000);
  }
});

test("a long run of marks in Montserrat stays within the shaping budget", () => {
  const text = `a${"\u0301".repeat(3000)}`;
  const { operations, maxOperations } = shapeTextCounted(parse(montserrat.ttf), text);
  expect(operations).toBeLessThanOrEqual(maxOperations);
});

test("NFC of a text from the package's own tables", () => {
  expect(normalizeNfc("Cafe\u0301 Vie\u0323\u0302t \u212b")).toBe("Caf\u00e9 Vi\u1ec7t \u00c5");
  expect(normalizeNfc("\u1100\u1161\u11a8")).toBe("\uac01");
  expect(normalizeNfc("\u0915\u093c")).toBe("\u0915\u093c");
  expect(normalizeNfc("plain")).toBe("plain");
});

test("every sample row normalizes through the real clustering (clusterStarts, normalizeText, normalizeNfc)", () => {
  const text = (codePoints: readonly number[]) => String.fromCodePoint(...codePoints);
  const failures: string[] = [];
  for (const [c1 = [], c2 = [], c3 = [], c4 = [], c5 = []] of tests) {
    const check = (source: number[], maps: (codePoint: number) => boolean, expected: number[]) => {
      const actual = normalizeText(text(source), maps, "canonical").codePoints;
      if (hex(actual) !== hex(expected))
        failures.push(`${hex(source)}: ${hex(actual)}, expected ${hex(expected)}`);
    };
    for (const source of [c1, c2, c3]) {
      check(source, decomposedFont, c3);
      check(source, composedFont, c2);
      if (normalizeNfc(text(source)) !== text(c2)) failures.push(`NFC ${hex(source)}`);
    }
    for (const source of [c4, c5]) {
      check(source, decomposedFont, c5);
      check(source, composedFont, c4);
    }
  }
  expect(failures.slice(0, 20)).toEqual([]);
  // Kirat Rai vowels are letters (not marks) that compose: they stay in one cluster.
  expect(normalizeNfc(text([0x16d63, 0x16d67, 0x16d67]))).toBe(text([0x16d6a]));
});

test("a precomposed character the font maps survives without the composites on the way to it", () => {
  for (const order of ["canonical", "font"] as const) {
    const syllable = font(0xac01);
    expect(normalize([0xac01], syllable, order)).toEqual([0xac01]);
    expect(normalize([0x1100, 0x1161, 0x11a8], syllable, order)).toEqual([0xac01]);
    expect(normalize([0xac00, 0x11a8], syllable, order)).toEqual([0xac01]);
    const viet = font(0x56, 0x69, 0x74, 0x1ec7);
    for (const spelling of [
      [0x1ec7],
      [0x1eb9, 0x302],
      [0xea, 0x323],
      [0x65, 0x323, 0x302],
      [0x65, 0x302, 0x323],
    ]) {
      expect(normalize(spelling, viet, order)).toEqual([0x1ec7]);
    }
  }
  const montserratFont = parse(montserrat.ttf);
  for (const codePoint of [0x230, 0x231, 0x1e1c, 0x1e1d]) {
    const char = String.fromCodePoint(codePoint);
    const decomposed = String.fromCodePoint(...normalize([codePoint], decomposedFont));
    expect(normalizeForFont(montserratFont, char)).toBe(char);
    expect(normalizeForFont(montserratFont, decomposed)).toBe(char);
  }
});
