import type { EntropyBits } from "./EntropyBits.js";
import type { HuffmanTable } from "./HuffmanTable.js";

/**
 * The largest dequantized coefficient (value times its quantization entry) the check accepts. An 8-bit encoder writes
 * at most about 1024 plus half the entry (T.81 F.1.1.4: DC within -1024..1016, AC within 10 bits); alone in its block
 * a coefficient was measured drawn alike up to 4096 and apart from 8192 on, where libjpeg-turbo's 16-bit arithmetic
 * (SIMD dequantization and IDCT) overflows and jpeg-decoder's 32-bit one does not. Together they meet
 * `maxColumnPairSum`.
 */
export const maxDequantized = 4096;

/**
 * The largest sum the check accepts of the dequantized magnitudes (final value, refinement bits included, times its
 * quantization entry) of the coefficients in columns u and u + 4 of one block (column u holds frequency u across the
 * block; DC is column 0). libjpeg-turbo's SIMD integer IDCT keeps the first pass's outputs in 16 bits (4 x 1.387
 * times its column's sum at most) and adds and subtracts those of columns u and u + 4 in 16 bits in the second pass, so nothing overflows below
 * a pair of 5906. Measured on x86-64 Chromium against resvg with 8x8 blocks scaled to a given pair: alike up to 5888,
 * apart from 6008 on. Genuine encodings reach 3430 (Pillow, libjpeg-turbo: high-contrast and worst-case patterns at
 * quality 1-100, grey, 4:4:4 and 4:2:0, baseline and progressive); an 8-bit block at quality 100 3504 at most.
 */
export const maxColumnPairSum = 4608;

/**
 * Where a block's four column-pair sums go: `sums[at]` to `sums[at + 3]`, pair p holding columns p and p + 4. A
 * sequential block sums into scratch space, a progressive one into its component's sums, kept across the scans.
 */
export type ColumnSums = Uint16Array | Int32Array;

/** The column pair (column modulo 4) of each zigzag position. */
const zigzagPair = Uint8Array.from(
  [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
    13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59,
    52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
  ],
  (natural) => natural & 3,
);

/** The four sums of the sequential block being walked. */
const scratch = new Int32Array(4);

/**
 * Adds `magnitude` at point transform `low` times `entry` (a value, a new refinement coefficient or a correction bit)
 * to the column pair of zigzag position `k` in `sums` from `at`; true where the pair then passes `maxColumnPairSum`.
 * A progressive pair stops there, so it never passes 65535: `tooLarge` keeps a coefficient's total within 4096. A
 * refinement bit of a negative DC value lowers its magnitude; adding it keeps the sum an upper bound.
 */
function addToPair(
  sums: ColumnSums | undefined,
  at: number,
  k: number,
  magnitude: number,
  low: number,
  entry: number | undefined,
): boolean {
  if (sums === undefined || magnitude === 0) return false;
  const index = at + (zigzagPair[k] ?? 0);
  const sum = (sums[index] ?? 0) + magnitude * (1 << low) * (entry ?? 1);
  sums[index] = sum;
  return sum > maxColumnPairSum;
}

/** Quantization entries of 1, for a component the walk has no table of (the marker walk refuses such a scan). */
const ones = new Uint16Array(64).fill(1);

/**
 * What breaks the symbols of one block, each a point where libjpeg-turbo 3.1 and jpeg-decoder 0.3.1 part ways:
 * `code` no code of up to 16 bits matches (libjpeg warns and goes on, jpeg-decoder fails); `dc-category` a DC
 * difference of category 12-15 (jpeg-decoder fails); `value` a coefficient whose largest final magnitude (refinement
 * bits included) times its quantization entry passes `maxDequantized` (fail-closed); `ac-run` a run past the end of
 * the block or band (libjpeg stores the value past it, jpeg-decoder drops it or stores it elsewhere); `eob-run` an
 * end-of-band run in a sequential scan (jpeg-decoder reads its bits and skips the next blocks, libjpeg ends the
 * block); `refine-size` a refinement value of another size than 1 (jpeg-decoder fails); `columns` a block whose
 * column pair passes `maxColumnPairSum` (fail-closed).
 */
export type BlockFault =
  "code" | "dc-category" | "value" | "ac-run" | "eob-run" | "refine-size" | "columns";

/**
 * True where a coefficient of `magnitude` at point transform `low` may end past `maxDequantized` with `entry`: the
 * refinement scans still to come can add up to 2^low - 1. That holds only for refinements in order, one bit below the
 * last each time: `JpegStructure` refuses a scan out of progression order before its data is walked.
 */
const tooLarge = (magnitude: number, low: number, entry: number | undefined) =>
  ((magnitude + 1) * (1 << low) - 1) * (entry ?? 1) > maxDequantized;

/** The value of `size` magnitude bits read from `bits` (T.81 F.2.2.1 EXTEND). */
function extended(bits: EntropyBits, size: number): number {
  const raw = bits.read(size);
  return raw < 1 << (size - 1) ? raw - (1 << size) + 1 : raw;
}

/** One sequential (SOF0, SOF1) block: the DC difference into `predictors[component]`, then the AC symbols to 63. */
export function sequentialBlock(
  bits: EntropyBits,
  dc: HuffmanTable,
  ac: HuffmanTable,
  predictors: Int32Array,
  component: number,
  quant: Uint16Array = ones,
): BlockFault | undefined {
  scratch.fill(0);
  const fault = dcFirstBlock(bits, dc, predictors, component, 0, quant, scratch, 0);
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
    k += run;
    if (k > 63) return "ac-run";
    const magnitude = Math.abs(extended(bits, size));
    if (tooLarge(magnitude, 0, quant[k])) return "value";
    if (addToPair(scratch, 0, k, magnitude, 0, quant[k])) return "columns";
  }
  return undefined;
}

/**
 * One block of a scan that delivers DC values: the difference into `predictors[component]`, the value scaled by
 * `low` and checked against quantization entry 0 of `quant`, its magnitude added to column pair 0 of the block's `sums`
 * from `at` (none for a block past the component's edge, which no output draws).
 */
export function dcFirstBlock(
  bits: EntropyBits,
  dc: HuffmanTable,
  predictors: Int32Array,
  component: number,
  low: number,
  quant: Uint16Array = ones,
  sums?: ColumnSums,
  at = 0,
): BlockFault | undefined {
  const category = dc.decode(bits);
  if (category === undefined) return "code";
  if (category > 11) return "dc-category";
  const predictor = (predictors[component] ?? 0) + (category === 0 ? 0 : extended(bits, category));
  predictors[component] = predictor;
  if (tooLarge(Math.abs(predictor), low, quant[0])) return "value";
  return addToPair(sums, at, 0, Math.abs(predictor), low, quant[0]) ? "columns" : undefined;
}

/** One block of a DC refinement scan at point transform `low`: its bit, added to column pair 0 of the block. */
export function dcRefineBlock(
  bits: EntropyBits,
  low: number,
  quant: Uint16Array = ones,
  sums?: ColumnSums,
  at = 0,
): BlockFault | undefined {
  return addToPair(sums, at, 0, bits.read(1), low, quant[0]) ? "columns" : undefined;
}

/**
 * One block of a first AC scan of band `start`-`end` at point transform `low`: its symbols, the coefficients it makes
 * nonzero set in `history` (two words per block, bit k for zigzag position k) and their magnitudes added to the block's
 * column pairs in `sums` (four per block). Returns the end-of-band run that follows (0 when the block ends otherwise),
 * or the fault.
 */
export function acFirstBlock(
  bits: EntropyBits,
  ac: HuffmanTable,
  band: readonly [start: number, end: number],
  low: number,
  history: Uint32Array,
  block: number,
  quant: Uint16Array = ones,
  sums?: ColumnSums,
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
    k += run;
    if (k > end) return "ac-run";
    const magnitude = Math.abs(extended(bits, size));
    if (tooLarge(magnitude, low, quant[k])) return "value";
    if (addToPair(sums, 4 * block, k, magnitude, low, quant[k])) return "columns";
    setNonzero(history, block, k);
  }
  return 0;
}

/**
 * One block of an AC refinement scan of band `start`-`end` outside an end-of-band run (libjpeg jdphuff.c
 * decode_mcu_AC_refine, T.81 G.1.2.3): new coefficients of size 1 with their sign, a correction bit for every
 * coefficient already nonzero that the runs pass; each new coefficient and correction added to the block's pairs in `sums`.
 * Returns the end-of-band run that follows, or the fault.
 */
export function acRefineBlock(
  bits: EntropyBits,
  ac: HuffmanTable,
  band: readonly [start: number, end: number],
  low: number,
  history: Uint32Array,
  block: number,
  quant: Uint16Array = ones,
  sums?: ColumnSums,
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
      const fault = runCorrections(bits, history, block, 1, [k, end], low, quant, sums);
      return fault ?? length - 1;
    }
    for (; k <= end; k++) {
      if (isNonzero(history, block, k)) {
        if (addToPair(sums, 4 * block, k, bits.read(1), low, quant[k])) return "columns";
      } else if (--run < 0) break;
    }
    if (size !== 0) {
      if (k > end) return "ac-run";
      if (tooLarge(1, low, quant[k])) return "value";
      if (addToPair(sums, 4 * block, k, 1, low, quant[k])) return "columns";
      setNonzero(history, block, k);
    }
  }
  return 0;
}

/**
 * The correction bits of `count` blocks from `first` on in an end-of-band run of a refinement scan at point transform
 * `low`: one per coefficient of band `from`-`to` already nonzero, in block and zigzag order, each added to its block's
 * column pair in `sums`. Returns the fault, if any.
 */
export function runCorrections(
  bits: EntropyBits,
  history: Uint32Array,
  first: number,
  count: number,
  band: readonly [from: number, to: number],
  low: number,
  quant: Uint16Array = ones,
  sums?: ColumnSums,
): BlockFault | undefined {
  const [from, to] = band;
  if (from > to) return undefined;
  const masks = [wordMask(from, to, 0), wordMask(from, to, 32)];
  for (let block = first; block < first + count; block++) {
    for (let half = 0; half < 2; half++) {
      let word = (history[2 * block + half] ?? 0) & (masks[half] ?? 0);
      while (word !== 0) {
        const lowest = word & -word;
        const k = 32 * half + 31 - Math.clz32(lowest);
        if (addToPair(sums, 4 * block, k, bits.read(1), low, quant[k])) return "columns";
        word ^= lowest;
      }
    }
  }
  return undefined;
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
