import { bracketOf } from "./unicode/bidiBrackets.js";
import { bidiClassIndex } from "./unicode/bidiClass.js";

// Bidi classes by their index in bidiClassValues.
const L = 0;
const R = 1;
const AL = 2;
const EN = 3;
const ES = 4;
const ET = 5;
const AN = 6;
const CS = 7;
const NSM = 8;
const BN = 9;
const B = 10;
const S = 11;
const WS = 12;
const ON = 13;
const LRE = 14;
const LRO = 15;
const RLE = 16;
const RLO = 17;
const PDF = 18;
const LRI = 19;
const RLI = 20;
const FSI = 21;
const PDI = 22;

/** UAX #9 BD2: the deepest explicit embedding level. */
export const maxDepth = 125;
/** UAX #9 BD16: the bracket stack holds 63 openings; a 64th stops pairing for the sequence. */
export const maxBracketDepth = 63;

/** A paragraph's resolved bidi levels (UAX #9 up to I2), per UTF-16 unit of its text. */
export interface BidiParagraph {
  /** The paragraph embedding level: 0 left-to-right, 1 right-to-left. */
  readonly level: number;
  /** Level of every UTF-16 unit (both units of a surrogate pair share one), line rules not yet applied. */
  readonly levels: Uint8Array;
  /** Bidi class index of every UTF-16 unit, for the line rule L1. */
  readonly classes: Uint8Array;
}

/** Work counted while resolving, for tests that pin the algorithm as linear. */
export interface BidiWork {
  operations: number;
}

const isIsolateInitiator = (type: number) => type === LRI || type === RLI || type === FSI;
const isRemoved = (type: number) =>
  type === BN || type === LRE || type === LRO || type === RLE || type === RLO || type === PDF;
const isStrongOrNumber = (type: number) => type === L || type === R || type === EN || type === AN;
/** N1/N2 and N0 see numbers as right-to-left. */
const strongDirection = (type: number) => (type === L ? L : R);

/**
 * Resolves the embedding levels of one paragraph by the Unicode Bidirectional Algorithm (UAX #9, Unicode 16.0.0):
 * P2-P3 (unless a direction is given), X1-X10, W1-W7, N0-N2, I1-I2. Characters X9 removes (embedding controls,
 * BN) take the level of the character before them. Linear in the text: explicit depth 125, bracket depth 63.
 */
export function resolveLevels(
  text: string,
  direction: "ltr" | "rtl" | "auto" = "auto",
  work: BidiWork = { operations: 0 },
): BidiParagraph {
  const codePoints: number[] = [];
  const units: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index) ?? 0;
    codePoints.push(codePoint);
    units.push(index);
    if (codePoint > 0xffff) index++;
  }
  const original = codePoints.map((codePoint) => bidiClassIndex(codePoint));
  const matching = matchIsolates(original);
  const level =
    direction === "ltr"
      ? 0
      : direction === "rtl"
        ? 1
        : (firstStrongLevel(original, matching, 0, original.length, work) ?? 0);
  const types = [...original];
  const levels = explicitLevels(original, types, matching, level, work);
  const sequences = isolatingRunSequences(original, levels, matching, level);
  for (const sequence of sequences)
    resolveSequence(sequence, types, original, codePoints, levels, work);
  let previous = level;
  for (let index = 0; index < types.length; index++) {
    if (isRemoved(original[index] ?? ON)) levels[index] = previous;
    else previous = levels[index] ?? level;
  }
  const unitLevels = new Uint8Array(text.length);
  const unitClasses = new Uint8Array(text.length);
  units.forEach((unit, index) => {
    const value = levels[index] ?? level;
    unitLevels[unit] = value;
    unitClasses[unit] = original[index] ?? ON;
    if ((codePoints[index] ?? 0) > 0xffff) {
      unitLevels[unit + 1] = value;
      unitClasses[unit + 1] = original[index] ?? ON;
    }
  });
  return { level, levels: unitLevels, classes: unitClasses };
}

/**
 * The levels of one line of a paragraph, UTF-16 units [start, end), with rule L1: segment and paragraph separators,
 * and whitespace and isolate controls before them or at the line end, go back to the paragraph level. Characters
 * X9 removed count as whitespace here.
 */
export function lineLevels(paragraph: BidiParagraph, start: number, end: number): Uint8Array {
  const levels = paragraph.levels.slice(start, end);
  let trailing = true;
  for (let index = end - 1; index >= start; index--) {
    const type = paragraph.classes[index] ?? ON;
    const offset = index - start;
    if (type === S || type === B) {
      levels[offset] = paragraph.level;
      trailing = true;
    } else if (
      trailing &&
      (type === WS || isIsolateInitiator(type) || type === PDI || isRemoved(type))
    ) {
      levels[offset] = paragraph.level;
    } else {
      trailing = false;
    }
  }
  return levels;
}

/**
 * The visual order of items with these levels (rule L2): from the highest level down to the lowest odd one, every
 * run at that level or above is reversed. Indices into `levels`, for the range [start, end).
 */
export function visualOrder(levels: ArrayLike<number>, start = 0, end = levels.length): number[] {
  const order: number[] = [];
  let highest = 0;
  let lowestOdd = Infinity;
  for (let index = start; index < end; index++) {
    order.push(index);
    const level = levels[index] ?? 0;
    highest = Math.max(highest, level);
    if (level % 2 === 1) lowestOdd = Math.min(lowestOdd, level);
  }
  for (let level = highest; level >= lowestOdd; level--) {
    let index = 0;
    while (index < order.length) {
      if ((levels[order[index] ?? 0] ?? 0) < level) {
        index++;
        continue;
      }
      let runEnd = index;
      while (runEnd < order.length && (levels[order[runEnd] ?? 0] ?? 0) >= level) runEnd++;
      order.splice(index, runEnd - index, ...order.slice(index, runEnd).reverse());
      index = runEnd;
    }
  }
  return order;
}

/** BD9: the matching PDI of every isolate initiator and the initiator of every matched PDI (-1: none). */
function matchIsolates(types: readonly number[]): Int32Array {
  const matching = new Int32Array(types.length).fill(-1);
  const open: number[] = [];
  types.forEach((type, index) => {
    if (isIsolateInitiator(type)) open.push(index);
    else if (type === PDI) {
      const initiator = open.pop();
      if (initiator !== undefined) {
        matching[initiator] = index;
        matching[index] = initiator;
      }
    }
  });
  return matching;
}

/** P2-P3: 1 or 0 from the first strong character in [start, end), past isolates; undefined without one. */
function firstStrongLevel(
  types: readonly number[],
  matching: Int32Array,
  start: number,
  end: number,
  work: BidiWork,
): number | undefined {
  for (let index = start; index < end; index++) {
    work.operations++;
    const type = types[index] ?? ON;
    if (type === L) return 0;
    if (type === R || type === AL) return 1;
    if (isIsolateInitiator(type)) {
      const pdi = matching[index] ?? -1;
      if (pdi < 0) return undefined;
      index = pdi;
    }
  }
  return undefined;
}

interface StackEntry {
  readonly level: number;
  readonly override: number;
  readonly isolate: boolean;
}

/** X1-X8: explicit levels and overrides; `types` gets the overridden classes. */
function explicitLevels(
  original: readonly number[],
  types: number[],
  matching: Int32Array,
  paragraphLevel: number,
  work: BidiWork,
): Uint8Array {
  const levels = new Uint8Array(original.length);
  const stack: StackEntry[] = [{ level: paragraphLevel, override: ON, isolate: false }];
  let overflowIsolates = 0;
  let overflowEmbeddings = 0;
  let validIsolates = 0;
  const top = () =>
    stack[stack.length - 1] ?? { level: paragraphLevel, override: ON, isolate: false };
  const next = (odd: boolean) => {
    const level = top().level;
    return odd ? (level + 1) | 1 : (level + 2) & ~1;
  };
  for (let index = 0; index < original.length; index++) {
    work.operations++;
    let type = original[index] ?? ON;
    const current = top();
    if (type === RLE || type === LRE || type === RLO || type === LRO) {
      levels[index] = current.level;
      const level = next(type === RLE || type === RLO);
      if (level <= maxDepth && overflowIsolates === 0 && overflowEmbeddings === 0) {
        stack.push({
          level,
          override: type === RLO ? R : type === LRO ? L : ON,
          isolate: false,
        });
      } else if (overflowIsolates === 0) {
        overflowEmbeddings++;
      }
      continue;
    }
    if (isIsolateInitiator(type)) {
      levels[index] = current.level;
      if (current.override !== ON) types[index] = current.override;
      if (type === FSI) {
        const pdi = matching[index] ?? -1;
        const inner = firstStrongLevel(
          original,
          matching,
          index + 1,
          pdi < 0 ? original.length : pdi,
          work,
        );
        type = inner === 1 ? RLI : LRI;
      }
      const level = next(type === RLI);
      if (level <= maxDepth && overflowIsolates === 0 && overflowEmbeddings === 0) {
        validIsolates++;
        stack.push({ level, override: ON, isolate: true });
      } else {
        overflowIsolates++;
      }
      continue;
    }
    if (type === PDI) {
      if (overflowIsolates > 0) overflowIsolates--;
      else if (validIsolates > 0) {
        overflowEmbeddings = 0;
        while (!top().isolate) stack.pop();
        stack.pop();
        validIsolates--;
      }
      const after = top();
      levels[index] = after.level;
      if (after.override !== ON) types[index] = after.override;
      continue;
    }
    if (type === PDF) {
      levels[index] = current.level;
      if (overflowIsolates > 0) continue;
      if (overflowEmbeddings > 0) overflowEmbeddings--;
      else if (!current.isolate && stack.length >= 2) stack.pop();
      continue;
    }
    if (type === B) {
      levels[index] = paragraphLevel;
      continue;
    }
    levels[index] = current.level;
    if (current.override !== ON && type !== BN) types[index] = current.override;
  }
  return levels;
}

interface Sequence {
  readonly positions: number[];
  readonly level: number;
  readonly sos: number;
  readonly eos: number;
}

/**
 * X10, BD13: level runs of the characters X9 keeps, chained through matched isolates, with sos and eos. Works on the
 * original classes: an override changes an isolate control's type, not its role.
 */
function isolatingRunSequences(
  types: readonly number[],
  levels: Uint8Array,
  matching: Int32Array,
  paragraphLevel: number,
): Sequence[] {
  const kept: number[] = [];
  for (let index = 0; index < types.length; index++) {
    if (!isRemoved(types[index] ?? ON)) kept.push(index);
  }
  const runs: number[][] = [];
  for (const index of kept) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run !== undefined && last !== undefined && levels[last] === levels[index]) run.push(index);
    else runs.push([index]);
  }
  const runStartingAt = new Map<number, number[]>();
  for (const run of runs) runStartingAt.set(run[0] ?? -1, run);
  const keptAfter = new Int32Array(types.length + 1).fill(-1);
  const keptBefore = new Int32Array(types.length + 1).fill(-1);
  kept.forEach((index, position) => {
    keptAfter[index] = kept[position + 1] ?? -1;
    keptBefore[index] = kept[position - 1] ?? -1;
  });
  const sequences: Sequence[] = [];
  for (const run of runs) {
    const first = run[0] ?? 0;
    if (types[first] === PDI && (matching[first] ?? -1) >= 0) continue;
    const positions = [...run];
    let last = positions[positions.length - 1] ?? first;
    while (isIsolateInitiator(types[last] ?? ON) && (matching[last] ?? -1) >= 0) {
      const next = runStartingAt.get(matching[last] ?? -1);
      if (next === undefined) break;
      positions.push(...next);
      last = positions[positions.length - 1] ?? last;
    }
    const level = levels[first] ?? paragraphLevel;
    const before = keptBefore[first] ?? -1;
    const after = keptAfter[last] ?? -1;
    const startLevel = Math.max(level, before < 0 ? paragraphLevel : (levels[before] ?? 0));
    const unmatchedIsolate = isIsolateInitiator(types[last] ?? ON);
    const endLevel = Math.max(
      levels[last] ?? level,
      after < 0 || unmatchedIsolate ? paragraphLevel : (levels[after] ?? 0),
    );
    sequences.push({
      positions,
      level,
      sos: startLevel % 2 === 1 ? R : L,
      eos: endLevel % 2 === 1 ? R : L,
    });
  }
  return sequences;
}

/** W1-W7, N0-N2 and I1-I2 on one isolating run sequence. */
function resolveSequence(
  sequence: Sequence,
  types: number[],
  original: readonly number[],
  codePoints: readonly number[],
  levels: Uint8Array,
  work: BidiWork,
): void {
  const { positions, sos, eos } = sequence;
  const count = positions.length;
  const type = (position: number) => types[positions[position] ?? -1] ?? ON;
  const set = (position: number, value: number) => {
    types[positions[position] ?? -1] = value;
  };
  work.operations += count;
  // W1
  for (let position = 0; position < count; position++) {
    if (type(position) !== NSM) continue;
    const previous = position === 0 ? sos : type(position - 1);
    set(position, isIsolateInitiator(previous) || previous === PDI ? ON : previous);
  }
  // W2, W3
  let lastStrong = sos;
  for (let position = 0; position < count; position++) {
    const current = type(position);
    if (current === L || current === R || current === AL) lastStrong = current;
    if (current === EN && lastStrong === AL) set(position, AN);
  }
  for (let position = 0; position < count; position++) if (type(position) === AL) set(position, R);
  // W4
  for (let position = 1; position + 1 < count; position++) {
    const current = type(position);
    const before = type(position - 1);
    const after = type(position + 1);
    if (current === ES && before === EN && after === EN) set(position, EN);
    else if (current === CS && before === after && (before === EN || before === AN)) {
      set(position, before);
    }
  }
  // W5
  for (let position = 0; position < count; position++) {
    if (type(position) !== ET) continue;
    let end = position;
    while (end < count && type(end) === ET) end++;
    const touchesNumber = (position > 0 && type(position - 1) === EN) || type(end) === EN;
    if (touchesNumber) for (let at = position; at < end; at++) set(at, EN);
    position = end - 1;
  }
  // W6
  for (let position = 0; position < count; position++) {
    const current = type(position);
    if (current === ES || current === ET || current === CS) set(position, ON);
  }
  // W7
  lastStrong = sos;
  for (let position = 0; position < count; position++) {
    const current = type(position);
    if (current === L || current === R) lastStrong = current;
    if (current === EN && lastStrong === L) set(position, L);
  }
  const embedding = sequence.level % 2 === 1 ? R : L;
  resolveBrackets(sequence, types, original, codePoints, embedding, work);
  // N1, N2
  for (let position = 0; position < count; position++) {
    if (isStrongOrNumber(type(position))) continue;
    let end = position;
    while (end < count && !isStrongOrNumber(type(end))) end++;
    const before = position === 0 ? sos : strongDirection(type(position - 1));
    const after = end === count ? eos : strongDirection(type(end));
    const resolved = before === after ? before : embedding;
    for (let at = position; at < end; at++) set(at, resolved);
    position = end - 1;
  }
  // I1, I2
  for (const index of positions) {
    const level = levels[index] ?? 0;
    const current = types[index] ?? ON;
    if (level % 2 === 0) {
      if (current === R) levels[index] = level + 1;
      else if (current === AN || current === EN) levels[index] = level + 2;
    } else if (current === L || current === EN || current === AN) {
      levels[index] = level + 1;
    }
  }
}

/** U+2329 and U+232A are canonically equivalent to U+3008 and U+3009 (BD16). */
function canonicalBracket(codePoint: number): number {
  if (codePoint === 0x2329) return 0x3008;
  if (codePoint === 0x232a) return 0x3009;
  return codePoint;
}

/** N0: paired brackets take the direction of what they enclose, or of their context. */
function resolveBrackets(
  sequence: Sequence,
  types: number[],
  original: readonly number[],
  codePoints: readonly number[],
  embedding: number,
  work: BidiWork,
): void {
  const { positions, sos } = sequence;
  const type = (position: number) => types[positions[position] ?? -1] ?? ON;
  const pairs: [number, number][] = [];
  const open: { closing: number; position: number }[] = [];
  for (let position = 0; position < positions.length; position++) {
    if (type(position) !== ON) continue;
    const codePoint = codePoints[positions[position] ?? -1] ?? 0;
    const bracket = bracketOf(codePoint);
    if (bracket === undefined) continue;
    if (bracket.opening) {
      if (open.length === maxBracketDepth) break;
      open.push({ closing: canonicalBracket(bracket.pair), position });
      continue;
    }
    const closing = canonicalBracket(codePoint);
    for (let depth = open.length - 1; depth >= 0; depth--) {
      work.operations++;
      if (open[depth]?.closing !== closing) continue;
      pairs.push([open[depth]?.position ?? 0, position]);
      open.length = depth;
      break;
    }
  }
  pairs.sort((left, right) => left[0] - right[0]);
  let scanned = 0;
  let context = sos;
  for (const [opening, closing] of pairs) {
    for (; scanned < opening; scanned++) {
      work.operations++;
      const current = type(scanned);
      if (isStrongOrNumber(current)) context = strongDirection(current);
    }
    let inside = ON;
    for (let position = opening + 1; position < closing; position++) {
      work.operations++;
      const current = type(position);
      if (!isStrongOrNumber(current)) continue;
      const direction = strongDirection(current);
      if (direction === embedding) {
        inside = embedding;
        break;
      }
      inside = direction;
    }
    if (inside === ON) continue;
    const resolved = inside === embedding ? embedding : context === inside ? inside : embedding;
    for (const bracket of [opening, closing]) {
      types[positions[bracket] ?? -1] = resolved;
      for (let after = bracket + 1; after < positions.length; after++) {
        if (original[positions[after] ?? -1] !== NSM) break;
        types[positions[after] ?? -1] = resolved;
      }
    }
  }
}
