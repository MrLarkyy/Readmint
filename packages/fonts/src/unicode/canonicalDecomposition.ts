import { decodeVarints } from "./decodeVarints.js";
import { decompositionTriples } from "./ucdTables.js";

const hangulBase = 0xac00;
const leadingBase = 0x1100;
const vowelBase = 0x1161;
const trailingBase = 0x11a7;
const vowelCount = 21;
const trailingCount = 28;
const syllableCount = 11172;
const leadingCount = 19;
const pairKey = 0x110000;

let decompositions: Map<number, readonly [number] | readonly [number, number]> | undefined;
let compositions: Map<number, number> | undefined;

function decode(): void {
  const numbers = decodeVarints(decompositionTriples);
  const decomposed = new Map<number, readonly [number] | readonly [number, number]>();
  const composed = new Map<number, number>();
  let codePoint = 0;
  for (let index = 0; index + 2 < numbers.length; index += 3) {
    codePoint += numbers[index] ?? 0;
    const zigzag = numbers[index + 1] ?? 0;
    const first = codePoint + (zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2);
    const last = numbers[index + 2] ?? 0;
    const second = Math.floor(last / 2);
    decomposed.set(codePoint, second === 0 ? [first] : [first, second]);
    if (last % 2 === 0) composed.set(first * pairKey + second, codePoint);
  }
  decompositions = decomposed;
  compositions = composed;
}

/**
 * The canonical decomposition mapping of a code point (one level, Unicode 16.0.0): one code point for a singleton,
 * two otherwise; a Hangul syllable splits algorithmically into LV + T or L + V. Undefined when it has none.
 */
export function decompositionOf(
  codePoint: number,
): readonly [number] | readonly [number, number] | undefined {
  const syllable = codePoint - hangulBase;
  if (syllable >= 0 && syllable < syllableCount) {
    const trailing = syllable % trailingCount;
    if (trailing !== 0) return [codePoint - trailing, trailingBase + trailing];
    const leading = Math.floor(syllable / (vowelCount * trailingCount));
    const vowel = Math.floor((syllable % (vowelCount * trailingCount)) / trailingCount);
    return [leadingBase + leading, vowelBase + vowel];
  }
  if (decompositions === undefined) decode();
  return decompositions?.get(codePoint);
}

/**
 * The primary composite of two code points (UAX #15): undefined when they have none or it is excluded from
 * composition (Full_Composition_Exclusion). Hangul L + V and LV + T compose algorithmically.
 */
export function compositionOf(first: number, second: number): number | undefined {
  const leading = first - leadingBase;
  const vowel = second - vowelBase;
  if (leading >= 0 && leading < leadingCount && vowel >= 0 && vowel < vowelCount) {
    return hangulBase + (leading * vowelCount + vowel) * trailingCount;
  }
  const syllable = first - hangulBase;
  const trailing = second - trailingBase;
  if (
    syllable >= 0 &&
    syllable < syllableCount &&
    syllable % trailingCount === 0 &&
    trailing > 0 &&
    trailing < trailingCount
  ) {
    return first + trailing;
  }
  if (compositions === undefined) decode();
  return compositions?.get(first * pairKey + second);
}
