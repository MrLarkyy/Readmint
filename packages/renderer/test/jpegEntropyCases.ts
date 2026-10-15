import progressiveUri from "./assets/jpeg/progressive.jpg?inline";
import losslessUri from "./assets/jpeg/sof3-8bit-rgb.jpg?inline";
import { dataUriBytes } from "./exifImages.js";
import type { DrawnOutcome } from "./jpegStructureCases.js";

export interface JpegEntropyCase {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** A part of the sniffer's message; undefined where the sniffer accepts the file. */
  readonly message?: string;
  /** Measured in Chromium 156.0.8078.4 and resvg-wasm 2.6.2 (RM-61 probe); absent where only the source decides. */
  readonly chromium?: DrawnOutcome;
  readonly resvg?: DrawnOutcome;
  /** The pixel of the 32x16 drawing the pins are taken at, (0,0) unless named: one where the outputs differ. */
  readonly at?: readonly [x: number, y: number];
}

const segment = (marker: number, body: readonly number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
];
const range = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => from + index);
const category = (value: number) => (value === 0 ? 0 : Math.abs(value).toString(2).length);

/** A DHT table: `byLength[i]` the symbols of code length i + 1, codes assigned in order (T.81 Annex C). */
function huffman(id: number, byLength: readonly (readonly number[])[]) {
  const codes = new Map<number, string>();
  const counts: number[] = [];
  let next = 0;
  for (let length = 1; length <= 16; length++) {
    const symbols = byLength[length - 1] ?? [];
    counts.push(symbols.length);
    for (const symbol of symbols) codes.set(symbol, (next++).toString(2).padStart(length, "0"));
    next *= 2;
  }
  const code = (symbol: number) => {
    const found = codes.get(symbol);
    if (found === undefined) throw new Error(`no code for symbol ${String(symbol)}`);
    return found;
  };
  return { body: [id, ...counts, ...byLength.flat()], code };
}

/** DC categories 0-15 at five bits each (`00000`-`01111`): sixteen ones match no code. */
const dcTable = huffman(0x00, [[], [], [], [], range(16)]);
/** The same with an unused category 16, which libjpeg refuses to build for a DCT scan. */
const dcTableWith16 = huffman(0x00, [[], [], [], [], range(17)]);
/** Every AC symbol but 0xFF at eight bits each. */
const acTable = huffman(0x10, [[], [], [], [], [], [], [], range(255)]);

/** Entropy-coded bits as the encoder writes them, then bytes: padded, 0xFF stuffed with a zero. */
class Bits {
  private text = "";

  put(bits: string): this {
    this.text += bits;
    return this;
  }

  /** `value` in its `size` magnitude bits (T.81 F.1.2.1). */
  value(value: number, size = category(value)): this {
    if (size === 0) return this;
    const raw = value >= 0 ? value : value + (1 << size) - 1;
    return this.put(raw.toString(2).padStart(size, "0"));
  }

  dc(difference: number, table = dcTable): this {
    return this.put(table.code(category(difference))).value(difference);
  }

  ac(run: number, value: number, size = category(value)): this {
    return this.put(acTable.code((run << 4) | size)).value(value, size);
  }

  /** An end-of-band symbol: EOB for run 0, EOBn with its `extra` bits otherwise. */
  eob(run = 0, extra = 0): this {
    this.put(acTable.code(run << 4));
    return run === 0 ? this : this.put(extra.toString(2).padStart(run, "0"));
  }

  bytes(pad = "1"): number[] {
    const text = this.text + pad.repeat((8 - (this.text.length % 8)) % 8);
    this.text = "";
    return range(text.length / 8).flatMap((index) => {
      const byte = Number.parseInt(text.slice(index * 8, index * 8 + 8), 2);
      return byte === 0xff ? [0xff, 0] : [byte];
    });
  }
}

/** The DC values of the eight blocks of the grey file (4 across, 2 down): 78 103 128 153 / 178 165 140 115 grey. */
const greyValues = [-400, -200, 0, 200, 400, 300, 100, -100];

interface GreyOptions {
  /** Writes block `index`, DC difference `difference`; the default writes it and EOB. */
  readonly block?: (bits: Bits, index: number, difference: number) => void;
  readonly values?: readonly number[];
  /** Restart interval of the DRI segment, none without. */
  readonly dri?: number;
  /** Where restart markers go, every `restartEvery` blocks (the DRI interval by default). */
  readonly restartEvery?: number;
  /** Restart marker index per restart (0-7 in sequence by default). */
  readonly restartIndex?: (restart: number) => number;
  /** Bytes put right before a restart marker or the end, keyed by the block they follow. */
  readonly extra?: ReadonlyMap<number, readonly number[]>;
  readonly pad?: string;
  readonly quantization?: number;
  readonly dht?: readonly number[];
}

/** A baseline 32x16 grey JPEG built here: one component at 1x1, DQT of `quantization`, eight blocks of flat grey. */
function greyJpeg(options: GreyOptions = {}): Uint8Array {
  const values = options.values ?? greyValues;
  const every = options.restartEvery ?? options.dri ?? 0;
  const bits = new Bits();
  const data: number[] = [];
  let predictor = 0;
  for (const [index, value] of values.entries()) {
    if (every > 0 && index > 0 && index % every === 0) {
      const restart = index / every - 1;
      data.push(...bits.bytes(options.pad), ...(options.extra?.get(index - 1) ?? []));
      data.push(0xff, 0xd0 + (options.restartIndex?.(restart) ?? restart % 8));
      predictor = 0;
    }
    const difference = value - predictor;
    predictor = value;
    if (options.block === undefined) bits.dc(difference).eob();
    else options.block(bits, index, difference);
  }
  data.push(...bits.bytes(options.pad), ...(options.extra?.get(values.length - 1) ?? []));
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xdb, [0, ...new Array<number>(64).fill(options.quantization ?? 1)]),
    ...segment(0xc0, [8, 0, 16, 0, 32, 1, 1, 0x11, 0]),
    ...segment(0xc4, options.dht ?? [...dcTable.body, ...acTable.body]),
    ...(options.dri === undefined ? [] : segment(0xdd, [0, options.dri])),
    ...segment(0xda, [1, 1, 0x00, 0, 63, 0]),
    ...data,
    0xff,
    0xd9,
  ]);
}

interface ProgressiveScan {
  readonly start: number;
  readonly end: number;
  readonly high: number;
  readonly low: number;
  readonly data: (bits: Bits) => void;
}

/**
 * A progressive 32x16 grey JPEG built here, the grey file's DC values in five scans: DC at point transform 1, AC 1-5
 * at 1 (block 0 holds coefficient 1 = 20, the rest one EOB run), AC 6-63 (one EOB run), the AC 1-5 refinement (block
 * 0 gains coefficient 2 = 1) and the DC refinement. `edit` replaces the data of scan `index`.
 */
function progressiveJpeg(edit?: { readonly index: number; readonly data: (bits: Bits) => void }) {
  const halves = greyValues.map((value) => value / 2);
  const scans: ProgressiveScan[] = [
    {
      start: 0,
      end: 0,
      high: 0,
      low: 1,
      data: (bits) => {
        halves.forEach((value, index) => bits.dc(value - (halves[index - 1] ?? 0)));
      },
    },
    { start: 1, end: 5, high: 0, low: 1, data: (bits) => bits.ac(0, 10).eob().eob(2, 3) },
    { start: 6, end: 63, high: 0, low: 0, data: (bits) => bits.eob(3, 0) },
    {
      start: 1,
      end: 5,
      high: 1,
      low: 0,
      data: (bits) => bits.ac(0, 1).put("1").eob().eob(2, 3),
    },
    { start: 0, end: 0, high: 1, low: 0, data: (bits) => bits.put("10101010") },
  ];
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    ...segment(0xc2, [8, 0, 16, 0, 32, 1, 1, 0x11, 0]),
    ...segment(0xc4, [...dcTable.body, ...acTable.body]),
    ...scans.flatMap((scan, index) => {
      const bits = new Bits();
      (edit?.index === index ? edit.data : scan.data)(bits);
      return [
        ...segment(0xda, [1, 1, 0x00, scan.start, scan.end, (scan.high << 4) | scan.low]),
        ...bits.bytes(),
      ];
    }),
    0xff,
    0xd9,
  ]);
}

/** Lossless difference categories 0-16 at five bits each; `17` adds an unused category 17. */
const losslessTable = (extra: readonly number[] = []) =>
  huffman(0x00, [[], [], [], [], [...range(17), ...extra]]);

/**
 * A lossless 32x16 RGB JPEG built here (components R G B at 1x1, predictor 1): the first pixel's differences
 * `first`, every other one 0, so flat 200 28 128 by default.
 */
function losslessJpeg(
  first: readonly number[] = [72, -100, 0],
  options: { readonly extra?: readonly number[]; readonly table?: readonly number[] } = {},
): Uint8Array {
  const table = losslessTable(options.table);
  const bits = new Bits();
  for (const difference of first) {
    const size = category(difference);
    bits.put(table.code(size));
    if (size < 16) bits.value(difference, size);
  }
  for (let sample = 3; sample < 32 * 16 * 3; sample++) bits.put(table.code(0));
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xc3, [8, 0, 16, 0, 32, 3, 0x52, 0x11, 0, 0x47, 0x11, 0, 0x42, 0x11, 0]),
    ...segment(0xc4, table.body),
    ...segment(0xda, [3, 0x52, 0x00, 0x47, 0x00, 0x42, 0x00, 1, 0, 0]),
    ...bits.bytes(),
    ...(options.extra ?? []),
    0xff,
    0xd9,
  ]);
}

/**
 * A baseline 48x16 JPEG built here, components sampled 4x1, 2x1 and 1x1, one scan each, every block DC 0 and EOB.
 * Of component 2 libjpeg reads 3 blocks a row (48 * 2 / 4 / 8, rounded up), jpeg-decoder 4 (two 32-wide MCUs of 2).
 */
function unevenlySampledJpeg(): Uint8Array {
  const scan = (id: number, blocks: number) => {
    const bits = new Bits();
    for (let block = 0; block < blocks; block++) bits.dc(0).eob();
    return [...segment(0xda, [1, id, 0x00, 0, 63, 0]), ...bits.bytes()];
  };
  return new Uint8Array([
    0xff,
    0xd8,
    ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    ...segment(0xc0, [8, 0, 16, 0, 48, 3, 1, 0x41, 0, 2, 0x21, 0, 3, 0x11, 0]),
    ...segment(0xc4, [...dcTable.body, ...acTable.body]),
    ...scan(1, 12),
    ...scan(2, 6),
    ...scan(3, 4),
    0xff,
    0xd9,
  ]);
}

const inserted = (jpeg: Uint8Array, at: number, insert: readonly number[]) =>
  new Uint8Array([...jpeg.subarray(0, at), ...insert, ...jpeg.subarray(at)]);

/** Where the image data of scan `index` (0 the first) of `jpeg` starts and where the marker after it is. */
function scanData(jpeg: Uint8Array, index = 0): { readonly start: number; readonly end: number } {
  let seen = -1;
  for (let at = 2; at + 3 < jpeg.length;) {
    const marker = jpeg[at + 1] ?? 0;
    const length = ((jpeg[at + 2] ?? 0) << 8) | (jpeg[at + 3] ?? 0);
    at += 2 + length;
    if (marker !== 0xda) continue;
    let end = at;
    while (!(
      jpeg[end] === 0xff &&
      (jpeg[end + 1] ?? 0) !== 0 &&
      ((jpeg[end + 1] ?? 0) & 0xf8) !== 0xd0
    )) {
      end++;
    }
    if (++seen === index) return { start: at, end };
    at = end;
  }
  throw new Error(`the test JPEG has no scan ${String(index)}`);
}

/** `jpeg` with the image data of scan `index` cut at its middle and EOI after it. */
const cutInScan = (jpeg: Uint8Array, index = 0) => {
  const { start, end } = scanData(jpeg, index);
  return new Uint8Array([...jpeg.subarray(0, start + Math.floor((end - start) / 2)), 0xff, 0xd9]);
};
/** Sixteen one bits (`FF 00 FF 00`) at the start of the image data of scan `index`: no code matches them. */
const onesInScan = (jpeg: Uint8Array, index = 0) =>
  inserted(jpeg, scanData(jpeg, index).start, [0xff, 0, 0xff, 0]);
/** Bit 3 of the middle byte of the image data of scan `index` flipped. */
const flippedInScan = (jpeg: Uint8Array, index = 0) => {
  const { start, end } = scanData(jpeg, index);
  const bytes = jpeg.slice();
  let at = start + Math.floor((end - start) / 2);
  while (bytes[at] === 0xff || bytes[at - 1] === 0xff) at++;
  bytes[at] = (bytes[at] ?? 0) ^ 0x08;
  return bytes;
};

/**
 * The RM-61 probe of corrupt entropy-coded data: per kind of corruption, files built here (`greyJpeg`,
 * `progressiveJpeg`, `losslessJpeg`: exact symbols, restarts) and the genuine gradient (baseline), progressive.jpg and
 * sof3-8bit-rgb.jpg broken in place. Each row pins what Chromium and resvg draw at one pixel; the probe compared every
 * pixel, and where the two differ by more than 2 levels anywhere, `at` is the first such pixel.
 */
export function jpegEntropyCases(gradient: Uint8Array): JpegEntropyCase[] {
  const progressive = dataUriBytes(progressiveUri);
  const lossless = dataUriBytes(losslessUri);
  const rows: JpegEntropyCase[] = [
    // (k) Controls: the built files decode cleanly.
    { name: "the grey file", bytes: greyJpeg(), chromium: [78, 78, 78], resvg: [78, 78, 78] },
    {
      name: "the grey file with restarts every 2 blocks",
      bytes: greyJpeg({ dri: 2 }),
      chromium: [78, 78, 78],
      resvg: [78, 78, 78],
    },
    {
      name: "the progressive file",
      bytes: progressiveJpeg(),
      chromium: [82, 82, 82],
      resvg: [82, 82, 82],
    },
    {
      name: "the lossless file",
      bytes: losslessJpeg(),
      chromium: [200, 28, 128],
      resvg: [200, 28, 128],
    },
    // (a) A code that matches nothing.
    {
      name: "the gradient with sixteen one bits",
      bytes: onesInScan(gradient),
      message: "invalid Huffman code",
      chromium: [114, 120, 216],
      resvg: "nothing",
    },
    {
      name: "the gradient with a bit flipped",
      bytes: flippedInScan(gradient),
      chromium: [63, 72, 167],
      resvg: [63, 72, 167],
    },
    {
      name: "progressive.jpg with sixteen one bits",
      bytes: onesInScan(progressive, 1),
      message: "invalid Huffman code",
      chromium: [36, 41, 255],
      resvg: "nothing",
    },
    {
      name: "sof3-8bit-rgb.jpg with sixteen one bits",
      bytes: onesInScan(lossless),
      message: "invalid Huffman code",
      chromium: [128, 112, 128],
      resvg: "nothing",
    },
    {
      name: "sof3-8bit-rgb.jpg with a bit flipped",
      bytes: flippedInScan(lossless),
      message: "cut short by a marker",
      chromium: [0, 0, 255],
      resvg: [0, 0, 255],
    },
    {
      name: "the grey file with sixteen one bits in block 0",
      bytes: greyJpeg({
        block: (bits, index, difference) => {
          if (index === 0) bits.put("1".repeat(16));
          else bits.dc(difference).eob();
        },
      }),
      message: "invalid Huffman code",
      chromium: [255, 255, 255],
      resvg: "nothing",
    },
    // (b) The data cut short by a marker.
    {
      name: "the gradient cut in its image data, then EOI",
      bytes: cutInScan(gradient),
      message: "cut short by a marker",
      chromium: [111, 70, 112],
      resvg: [66, 104, 55],
      at: [15, 0],
    },
    {
      name: "the gradient with a COM inside its image data",
      bytes: inserted(gradient, scanData(gradient).start + 100, segment(0xfe, [0x68, 0x69])),
      message: "cut short by a marker",
      chromium: [111, 70, 112],
      resvg: [66, 104, 55],
      at: [15, 0],
    },
    {
      name: "progressive.jpg cut in its last scan, then EOI",
      bytes: cutInScan(progressive, 3),
      message: "cut short by a marker",
      chromium: [0, 4, 245],
      resvg: [0, 4, 245],
    },
    {
      name: "progressive.jpg cut in its first scan, then the other scans",
      bytes: new Uint8Array([
        ...cutInScan(progressive, 0).subarray(0, -2),
        ...progressive.subarray(scanData(progressive, 0).end),
      ]),
      message: "cut short by a marker",
      chromium: [0, 3, 245],
      resvg: [0, 3, 245],
    },
    {
      name: "sof3-8bit-rgb.jpg cut in its image data, then EOI",
      bytes: cutInScan(lossless),
      message: "cut short by a marker",
      chromium: [128, 128, 128],
      resvg: [241, 97, 240],
      at: [0, 8],
    },
    {
      name: "the grey file with EOI after block 3",
      bytes: greyJpeg({ restartEvery: 4, restartIndex: () => 0xd9 - 0xd0 }),
      message: "cut short by a marker",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    // (c) A run past the end of the block or band.
    {
      name: "the grey file with an AC run past coefficient 63",
      bytes: greyJpeg({
        block: (bits, index, difference) => {
          bits.dc(difference);
          if (index === 0) bits.ac(15, 5).ac(15, 5).ac(15, 5).ac(15, 5);
          else bits.eob();
        },
      }),
      message: "run of coefficients past the end of the block",
      chromium: [80, 80, 80],
      resvg: "nothing",
    },
    {
      name: "the progressive file with a first AC run past its band",
      bytes: progressiveJpeg({ index: 1, data: (bits) => bits.ac(5, 10).eob(2, 3) }),
      message: "run of coefficients past the end of the block",
      chromium: [81, 81, 81],
      resvg: [78, 78, 78],
    },
    {
      name: "the progressive file with a refinement run past its band",
      bytes: progressiveJpeg({
        index: 3,
        data: (bits) => bits.ac(4, 1).put("1").put("0").eob(2, 3),
      }),
      message: "run of coefficients past the end of the block",
      chromium: [82, 82, 82],
      resvg: "nothing",
    },
    // (d) Categories and sizes past what 8-bit samples need.
    {
      name: "the grey file with a DC difference of category 12",
      bytes: greyJpeg({
        block: (bits, index, difference) => {
          if (index === 0) bits.dc(-2100).eob();
          else if (index === 1) bits.dc(difference + 1700).eob();
          else bits.dc(difference).eob();
        },
      }),
      message: "DC difference of category 12 to 15",
      chromium: [103, 103, 103],
      resvg: "nothing",
      at: [8, 0],
    },
    {
      name: "the grey file with an AC value of size 11",
      bytes: greyJpeg({
        block: (bits, index, difference) => {
          bits.dc(difference);
          if (index === 0) bits.ac(0, 1500);
          bits.eob();
        },
      }),
      message: "AC value outside the 8-bit range",
      chromium: [255, 255, 255],
      resvg: [255, 255, 255],
    },
    {
      name: "the grey file, quantization 16, with an AC value of size 11",
      bytes: greyJpeg({
        quantization: 16,
        values: greyValues.map((value) => Math.round(value / 16)),
        block: (bits, index, difference) => {
          bits.dc(difference);
          if (index === 0) bits.ac(0, 1500);
          bits.eob();
        },
      }),
      message: "AC value outside the 8-bit range",
      chromium: [255, 255, 255],
      resvg: [255, 255, 255],
    },
    {
      name: "the grey file, quantization 64, with an AC value of size 11",
      bytes: greyJpeg({
        quantization: 64,
        values: greyValues.map((value) => Math.round(value / 64)),
        block: (bits, index, difference) => {
          bits.dc(difference);
          if (index === 0) bits.ac(0, 1500);
          bits.eob();
        },
      }),
      message: "AC value outside the 8-bit range",
      chromium: [0, 0, 0],
      resvg: [255, 255, 255],
      at: [1, 0],
    },
    {
      name: "the progressive file with an AC value of size 10 at point transform 1",
      bytes: progressiveJpeg({ index: 1, data: (bits) => bits.ac(0, 600).eob().eob(2, 3) }),
      message: "AC value outside the 8-bit range",
      chromium: [255, 255, 255],
      resvg: [255, 255, 255],
    },
    {
      name: "the lossless file with a difference of category 9",
      bytes: losslessJpeg([300, -100, 0]),
      chromium: [172, 28, 128],
      resvg: [172, 28, 128],
    },
    {
      name: "the lossless file with a difference of category 16",
      bytes: losslessJpeg([32768, -100, 0]),
      chromium: [128, 28, 128],
      resvg: [128, 28, 128],
    },
    // (e) An end-of-band run in a sequential scan.
    {
      name: "the grey file with EOB1 in block 0",
      bytes: greyJpeg({
        block: (bits, index, difference) => {
          bits.dc(difference);
          if (index === 0) bits.put(acTable.code(0x10));
          else bits.eob();
        },
      }),
      message: "end-of-band run",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    // (f) Restart markers.
    {
      name: "the grey file without its first restart marker",
      bytes: greyJpeg({ dri: 2, restartEvery: 4, restartIndex: (restart) => restart }),
      message: "extra bytes before a restart marker",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    {
      name: "the grey file with restart markers out of order",
      bytes: greyJpeg({ dri: 2, restartIndex: (restart) => [1, 0, 2][restart] ?? 0 }),
      message: "without the restart marker in sequence",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    {
      name: "the grey file with an extra restart marker",
      bytes: greyJpeg({ dri: 2, restartEvery: 1, restartIndex: (restart) => restart >> 1 }),
      message: "cut short by a marker",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    {
      name: "the grey file with restart markers, no DRI",
      bytes: greyJpeg({ restartEvery: 2 }),
      message: "cut short by a marker",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    {
      name: "the grey file with two bytes before a restart marker",
      bytes: greyJpeg({ dri: 2, extra: new Map([[1, [0x12, 0x34]]]) }),
      message: "extra bytes before a restart marker",
      chromium: [78, 78, 78],
      resvg: [78, 78, 78],
    },
    {
      name: "the grey file with sixteen bytes before a restart marker",
      bytes: greyJpeg({ dri: 2, extra: new Map([[1, range(16, 0x10)]]) }),
      message: "extra bytes before a restart marker",
      chromium: [78, 78, 78],
      resvg: "nothing",
    },
    {
      name: "the grey file with restarts every 2 blocks, padded with zero bits",
      bytes: greyJpeg({ dri: 2, pad: "0" }),
      chromium: [78, 78, 78],
      resvg: [78, 78, 78],
    },
    // (g) End-of-band runs past the scan or a restart.
    {
      name: "the progressive file with an EOB run past the scan",
      bytes: progressiveJpeg({ index: 2, data: (bits) => bits.eob(4, 0) }),
      chromium: [82, 82, 82],
      resvg: [82, 82, 82],
    },
    // (h) A refinement value of size 2.
    {
      name: "the progressive file with a refinement value of size 2",
      bytes: progressiveJpeg({
        index: 3,
        data: (bits) => bits.ac(0, 2).put("1").eob().eob(2, 3),
      }),
      message: "size other than 1",
      chromium: [82, 82, 82],
      resvg: "nothing",
    },
    // (i) DC values past what 12 bits hold.
    {
      name: "the grey file with a DC value of 4000",
      bytes: greyJpeg({ values: [2000, 4000, 2000, 0, 400, 300, 100, -100] }),
      message: "DC value outside the 8-bit range",
      chromium: [255, 255, 255],
      resvg: [255, 255, 255],
    },
    {
      name: "the grey file, quantization 16, with a DC value of 4000",
      bytes: greyJpeg({ quantization: 16, values: [2000, 4000, 2000, 0, 25, 18, 6, -6] }),
      message: "DC value outside the 8-bit range",
      chromium: [32, 32, 32],
      resvg: [255, 255, 255],
    },
    // (j) Bytes and bits after the last block.
    {
      name: "the gradient with two bytes before EOI",
      bytes: inserted(gradient, gradient.length - 2, [0x12, 0x34]),
      chromium: [65, 71, 167],
      resvg: [65, 71, 167],
    },
    {
      name: "the gradient with sixteen bytes before EOI",
      bytes: inserted(gradient, gradient.length - 2, range(16, 0x10)),
      chromium: [65, 71, 167],
      resvg: [65, 71, 167],
    },
    {
      name: "progressive.jpg with two bytes after its first scan",
      bytes: inserted(progressive, scanData(progressive, 0).end, [0x12, 0x34]),
      chromium: [0, 3, 245],
      resvg: [0, 3, 245],
    },
    {
      name: "the lossless file with two bytes before EOI",
      bytes: losslessJpeg(undefined, { extra: [0x12, 0x34] }),
      chromium: [200, 28, 128],
      resvg: [200, 28, 128],
    },
    {
      name: "the grey file padded with zero bits",
      bytes: greyJpeg({ pad: "0" }),
      chromium: [78, 78, 78],
      resvg: [78, 78, 78],
    },
    // (m) An unused DC category libjpeg refuses to build a table with.
    {
      name: "the grey file with an unused DC category 16",
      bytes: greyJpeg({ dht: [...dcTableWith16.body, ...acTable.body] }),
      message: "which holds a category above 15",
      chromium: "nothing",
      resvg: [78, 78, 78],
    },
    {
      name: "the lossless file with an unused category 17",
      bytes: losslessJpeg(undefined, { table: [17] }),
      message: "which holds a category above 16",
      chromium: "nothing",
      resvg: [200, 28, 128],
    },
    // (l) Blocks the two decoders count differently: by the source (decoder.rs decode_scan), not drawable at 32x16.
    {
      name: "a non-interleaved scan of a component sampled 2x1 under 4x1, 48 wide",
      bytes: unevenlySampledJpeg(),
      message: "non-interleaved scan whose blocks the two decoders count differently",
    },
  ];
  return rows;
}
