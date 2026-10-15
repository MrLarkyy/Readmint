import { clusterStarts } from "./clusterStarts.js";
import { compositionOf, decompositionOf } from "./unicode/canonicalDecomposition.js";
import { combiningClassOf, modifiedCombiningClassOf } from "./unicode/combiningClass.js";

/** The longest run of non-starters put in canonical order; a longer one stays as written (HarfBuzz's limit). */
export const maxReorderedMarks = 32;

/** Normalized characters with the cluster of each, and the work it took (tests pin it as a count). */
export interface NormalizedCharacters {
  readonly codePoints: number[];
  readonly clusters: number[];
  readonly steps: number;
}

/**
 * Canonical normalization restricted to what a font draws, one character cluster (a run of equal `clusters` values)
 * at a time: (1) every character is decomposed canonically and recursively, except a singleton decomposition
 * (U+212B, CJK compatibility ideographs) of a character the font maps; (2) each run of at most 32 non-starters is
 * stable-sorted by combining class; (3) Unicode canonical composition (UAX #15: blocking, composition exclusions,
 * Hangul) composes a pair only when the font maps the composite. Canonically equivalent clusters therefore give the
 * same characters for any font. `order` "font" sorts by HarfBuzz's modified classes (shadda before fatha), "canonical"
 * by Unicode's own (the NormalizationTest data). Linear: at most four code points per decomposition, sorting only
 * short runs, one composition pass.
 */
export function normalizeCharacters(
  codePoints: readonly number[],
  clusters: readonly number[],
  maps: (codePoint: number) => boolean,
  order: "canonical" | "font" = "font",
): NormalizedCharacters {
  const keyOf = order === "font" ? modifiedCombiningClassOf : combiningClassOf;
  const normalized: number[] = [];
  const normalizedClusters: number[] = [];
  const segment: number[] = [];
  const keys: number[] = [];
  let steps = 0;
  const decompose = (codePoint: number): void => {
    steps++;
    const mapping = decompositionOf(codePoint);
    if (mapping === undefined || (mapping.length === 1 && maps(codePoint))) {
      segment.push(codePoint);
      keys.push(keyOf(codePoint));
      return;
    }
    for (const part of mapping) decompose(part);
  };
  let start = 0;
  while (start < codePoints.length) {
    const cluster = clusters[start] ?? 0;
    let end = start;
    segment.length = 0;
    keys.length = 0;
    while (end < codePoints.length && clusters[end] === cluster) {
      decompose(codePoints[end] ?? 0);
      end++;
    }
    steps += reorder(segment, keys);
    const before = normalized.length;
    steps += compose(segment, keys, maps, normalized);
    for (let index = before; index < normalized.length; index++) normalizedClusters.push(cluster);
    start = end;
  }
  return { codePoints: normalized, clusters: normalizedClusters, steps };
}

/** Stable-sorts every run of at most `maxReorderedMarks` non-starters (key above 0) by key; the steps taken. */
function reorder(codePoints: number[], keys: number[]): number {
  let steps = 0;
  let index = 0;
  while (index < codePoints.length) {
    if (keys[index] === 0) {
      index++;
      steps++;
      continue;
    }
    let end = index;
    while (end < codePoints.length && keys[end] !== 0) end++;
    steps += end - index;
    if (end - index <= maxReorderedMarks) steps += insertionSort(codePoints, keys, index, end);
    index = end;
  }
  return steps;
}

function insertionSort(codePoints: number[], keys: number[], from: number, to: number): number {
  let steps = 0;
  for (let index = from + 1; index < to; index++) {
    const codePoint = codePoints[index] ?? 0;
    const key = keys[index] ?? 0;
    let at = index - 1;
    while (at >= from && (keys[at] ?? 0) > key) {
      codePoints[at + 1] = codePoints[at] ?? 0;
      keys[at + 1] = keys[at] ?? 0;
      at--;
      steps++;
    }
    codePoints[at + 1] = codePoint;
    keys[at + 1] = key;
    steps++;
  }
  return steps;
}

/**
 * Canonical composition of one cluster onto `output`: a character joins the last starter when nothing between them
 * blocks it (a starter, or a mark of an equal or higher class) and the font maps the composite. The steps taken.
 */
function compose(
  codePoints: readonly number[],
  keys: readonly number[],
  maps: (codePoint: number) => boolean,
  output: number[],
): number {
  let starter = -1;
  let lastKey = 0;
  for (let index = 0; index < codePoints.length; index++) {
    const codePoint = codePoints[index] ?? 0;
    const key = keys[index] ?? 0;
    if (starter >= 0 && (lastKey === 0 || lastKey < key)) {
      const composite = compositionOf(output[starter] ?? 0, codePoint);
      if (composite !== undefined && maps(composite)) {
        output[starter] = composite;
        continue;
      }
    }
    if (key === 0) starter = output.length;
    lastKey = key;
    output.push(codePoint);
  }
  return codePoints.length;
}

/**
 * `normalizeCharacters` over a text's character clusters (`clusterStarts`), each cluster value the UTF-16 offset of
 * its start, as `shapeText` takes them.
 */
export function normalizeText(
  text: string,
  maps: (codePoint: number) => boolean,
  order: "canonical" | "font" = "font",
): NormalizedCharacters {
  const codePoints: number[] = [];
  const clusters: number[] = [];
  const starts = clusterStarts(text);
  let next = 0;
  let cluster = 0;
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index) ?? 0;
    if (starts[next] === index) {
      cluster = index;
      next++;
    }
    codePoints.push(codePoint);
    clusters.push(cluster);
    if (codePoint > 0xffff) index++;
  }
  return normalizeCharacters(codePoints, clusters, maps, order);
}

/** The code points as a string (no spread: a long text would overflow the argument list). */
export function fromCodePoints(codePoints: readonly number[]): string {
  let text = "";
  for (const codePoint of codePoints) text += String.fromCodePoint(codePoint);
  return text;
}
