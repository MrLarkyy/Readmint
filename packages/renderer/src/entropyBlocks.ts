import type { EntropyBits } from "./EntropyBits.js";
import type { HuffmanTable } from "./HuffmanTable.js";

/**
 * What breaks the symbols of one block, each a point where libjpeg-turbo 3.1 and jpeg-decoder 0.3.1 part ways:
 * `code` no code of up to 16 bits matches (libjpeg warns and goes on, jpeg-decoder fails); `dc-category` a DC
 * difference of category 12-15 (jpeg-decoder fails); `dc-range` a DC value past what 12 bits hold (no 8-bit encoder
 * writes it; the decoders keep it in integers of other widths); `ac-size` an AC value past what 8-bit samples give
 * (likewise); `ac-run` a run past the end of the block or band (libjpeg stores the value past it, jpeg-decoder drops
 * it or stores it elsewhere); `eob-run` an end-of-band run in a sequential scan (jpeg-decoder reads its bits and skips
 * the next blocks, libjpeg ends the block); `refine-size` a refinement value of another size than 1 (jpeg-decoder
 * fails).
 */
export type BlockFault =
  "code" | "dc-category" | "dc-range" | "ac-size" | "ac-run" | "eob-run" | "refine-size";

/** One sequential (SOF0, SOF1) block: the DC difference into `predictors[component]`, then the AC symbols to 63. */
export function sequentialBlock(
  bits: EntropyBits,
  dc: HuffmanTable,
  ac: HuffmanTable,
  predictors: Int32Array,
  component: number,
): BlockFault | undefined {
  const fault = dcFirstBlock(bits, dc, predictors, component, 0);
  if (fault !== undefined) return fault;
  for (let k = 1; k <= 63; k++) {
    const symbol = ac.decode(bits);
    if (symbol === undefined) return "code";
    const run = symbol >> 4;
    const size = symbol & 0x0f;
    if (size === 0) {
      if (run === 15) {
        k += 15;
        continue;
      }
      return run === 0 ? undefined : "eob-run";
    }
    if (size > 10) return "ac-size";
    k += run;
    if (k > 63) return "ac-run";
    bits.skip(size);
  }
  return undefined;
}

/** One block of a scan that delivers DC values: the difference into `predictors[component]`, scaled by `low`. */
export function dcFirstBlock(
  bits: EntropyBits,
  dc: HuffmanTable,
  predictors: Int32Array,
  component: number,
  low: number,
): BlockFault | undefined {
  const category = dc.decode(bits);
  if (category === undefined) return "code";
  if (category > 11) return "dc-category";
  if (category === 0) return undefined;
  const raw = bits.read(category);
  const difference = raw < 1 << (category - 1) ? raw - (1 << category) + 1 : raw;
  const predictor = (predictors[component] ?? 0) + difference;
  predictors[component] = predictor;
  const value = predictor * (1 << low);
  return value < -2048 || value > 2047 ? "dc-range" : undefined;
}

/**
 * One block of a first AC scan of band `start`-`end` at point transform `low`: its symbols, the coefficients it makes
 * nonzero set in `history` (two words per block, bit k for zigzag position k). Returns the end-of-band run that
 * follows (0 when the block ends otherwise), or the fault.
 */
export function acFirstBlock(
  bits: EntropyBits,
  ac: HuffmanTable,
  band: readonly [start: number, end: number],
  low: number,
  history: Uint32Array,
  block: number,
): BlockFault | number {
  const [start, end] = band;
  for (let k = start; k <= end; k++) {
    const symbol = ac.decode(bits);
    if (symbol === undefined) return "code";
    const run = symbol >> 4;
    const size = symbol & 0x0f;
    if (size === 0) {
      if (run === 15) {
        k += 15;
        continue;
      }
      return (1 << run) + (run === 0 ? 0 : bits.read(run)) - 1;
    }
    if (size + low > 10) return "ac-size";
    k += run;
    if (k > end) return "ac-run";
    bits.skip(size);
    setNonzero(history, block, k);
  }
  return 0;
}

/**
 * One block of an AC refinement scan of band `start`-`end` outside an end-of-band run (libjpeg jdphuff.c
 * decode_mcu_AC_refine, T.81 G.1.2.3): new coefficients of size 1 with their sign, a correction bit for every
 * coefficient already nonzero that the runs pass. Returns the end-of-band run that follows, or the fault.
 */
export function acRefineBlock(
  bits: EntropyBits,
  ac: HuffmanTable,
  band: readonly [start: number, end: number],
  history: Uint32Array,
  block: number,
): BlockFault | number {
  const [start, end] = band;
  for (let k = start; k <= end; k++) {
    const symbol = ac.decode(bits);
    if (symbol === undefined) return "code";
    let run = symbol >> 4;
    const size = symbol & 0x0f;
    if (size !== 0) {
      if (size !== 1) return "refine-size";
      bits.skip(1);
    } else if (run !== 15) {
      const length = (1 << run) + (run === 0 ? 0 : bits.read(run));
      bits.skip(runCorrections(history, block, 1, [k, end]));
      return length - 1;
    }
    for (; k <= end; k++) {
      if (isNonzero(history, block, k)) bits.skip(1);
      else if (--run < 0) break;
    }
    if (size !== 0) {
      if (k > end) return "ac-run";
      setNonzero(history, block, k);
    }
  }
  return 0;
}

/**
 * The correction bits `count` blocks from `first` on take in an end-of-band run of a refinement scan: one per
 * coefficient of band `from`-`to` already nonzero.
 */
export function runCorrections(
  history: Uint32Array,
  first: number,
  count: number,
  band: readonly [from: number, to: number],
): number {
  const [from, to] = band;
  if (from > to) return 0;
  const lowMask = wordMask(from, to, 0);
  const highMask = wordMask(from, to, 32);
  let total = 0;
  for (let word = 2 * first; word < 2 * (first + count); word += 2) {
    const low = (history[word] ?? 0) & lowMask;
    const high = (history[word + 1] ?? 0) & highMask;
    if (low !== 0) total += bitCount(low);
    if (high !== 0) total += bitCount(high);
  }
  return total;
}

function isNonzero(history: Uint32Array, block: number, k: number): boolean {
  return (((history[2 * block + (k >> 5)] ?? 0) >>> (k & 31)) & 1) === 1;
}

function setNonzero(history: Uint32Array, block: number, k: number): void {
  const word = 2 * block + (k >> 5);
  history[word] = (history[word] ?? 0) | (1 << (k & 31));
}

/** The bits of positions `from`-`to` that fall into the word starting at position `base`. */
function wordMask(from: number, to: number, base: number): number {
  const first = Math.max(from - base, 0);
  const last = Math.min(to - base, 31);
  if (first > last) return 0;
  const upTo = last === 31 ? 0xffffffff : (1 << (last + 1)) - 1;
  return (upTo & ~((1 << first) - 1)) >>> 0;
}

function bitCount(word: number): number {
  let value = word >>> 0;
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (Math.imul((value + (value >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff;
}
