import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { EntropyBits } from "../src/EntropyBits.js";
import { dcRefineBlock, maxColumnPairSum, runCorrections } from "../src/entropyBlocks.js";
import { HuffmanTable } from "../src/HuffmanTable.js";
import {
  type EntropyScan,
  JpegEntropy,
  maxEntropySteps,
  maxProgressiveBlocks,
} from "../src/JpegEntropy.js";
import { entropyRefusal } from "../src/jpegRefusals.js";
import { sniffImage } from "../src/sniffImage.js";

const read = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "assets", ...name.split("/"))));

/** One code, `0`, for `symbol`. */
const oneCode = (symbol: number) =>
  new HuffmanTable([1, ...new Array<number>(15).fill(0)], Uint8Array.of(symbol), false);
const dc0 = oneCode(0);
const eob = oneCode(0x00);
/** One code, `0`, for EOB14: a run of 2^14 + its 14 bits empty bands. */
const eob14 = oneCode(0xe0);

const at420 = [
  { h: 2, v: 2 },
  { h: 1, v: 1 },
  { h: 1, v: 1 },
];

const scan = (overrides: Partial<EntropyScan>): EntropyScan => ({
  progressive: false,
  components: [{ index: 0, dc: dc0, ac: eob }],
  start: 0,
  end: 63,
  high: 0,
  low: 0,
  restartInterval: 0,
  ...overrides,
});

/** `units` restart intervals of `bits` zero bits each (padded with ones), RST0, RST1, ... between them. */
function intervals(units: number, bits: number): Uint8Array {
  const bytes: number[] = [];
  for (let unit = 0; unit < units; unit++) {
    if (unit > 0) bytes.push(0xff, 0xd0 + ((unit - 1) % 8));
    const text = "0".repeat(bits) + "1".repeat((8 - (bits % 8)) % 8);
    for (let at = 0; at < text.length; at += 8)
      bytes.push(Number.parseInt(text.slice(at, at + 8), 2));
  }
  return new Uint8Array([...bytes, 0xff, 0xd9]);
}

describe("genuine encoder output decodes cleanly", () => {
  // The last two by Pillow 12.0.0 (its libjpeg-turbo) from a 37x23 noisy gradient, quality 85:
  // `progressive=True, subsampling=2, restart_marker_blocks=3` (successive approximation, restarts in every scan)
  // and `subsampling=1, restart_marker_rows=1`.
  test.each([
    ["gradient.jpg", 32, 16],
    ["jpeg/progressive.jpg", 32, 16],
    ["jpeg/sof3-8bit-rgb.jpg", 32, 16],
    ["jpeg/progressive-420-restart3.jpg", 37, 23],
    ["jpeg/baseline-422-restart-rows.jpg", 37, 23],
  ])("%s", (name, width, height) => {
    expect(sniffImage(read(name), 1)).toMatchObject({ ok: true, info: { width, height } });
  });
});

describe("JpegEntropy restart geometry", () => {
  const interleaved = scan({
    components: [0, 1, 2].map((index) => ({ index, dc: dc0, ac: eob })),
    restartInterval: 1,
  });

  test("an interleaved 4:2:0 scan holds 2x2 MCUs of 4 + 1 + 1 blocks at 32x32", () => {
    const entropy = new JpegEntropy(32, 32, at420);
    // Each block is DC `0` and EOB `0`: 12 bits an MCU.
    expect(entropy.scanFault(intervals(4, 12), 0, interleaved)).toBeUndefined();
    // Data for MCUs of 4 blocks runs into the restart marker; data for 10 leaves a byte before it.
    expect(entropy.scanFault(intervals(4, 8), 0, interleaved)).toBe("marker");
    expect(entropy.scanFault(intervals(4, 20), 0, interleaved)).toBe("restart-data");
    expect(entropy.scanFault(intervals(3, 12), 0, interleaved)).toBe("restart");
  });

  test("a non-interleaved scan of a 4:2:0 chroma component holds 2x2 blocks at 32x32", () => {
    const entropy = new JpegEntropy(32, 32, at420);
    const chroma = scan({ components: [{ index: 1, dc: dc0, ac: eob }], restartInterval: 1 });
    expect(entropy.scanFault(intervals(4, 2), 0, chroma)).toBeUndefined();
    expect(entropy.scanFault(intervals(5, 2), 0, chroma)).toBeUndefined();
    expect(entropy.scanFault(intervals(3, 2), 0, chroma)).toBe("restart");
    const luma = scan({ components: [{ index: 0, dc: dc0, ac: eob }], restartInterval: 1 });
    expect(entropy.scanFault(intervals(16, 2), 0, luma)).toBeUndefined();
  });

  test("a restart marker out of sequence is a restart fault", () => {
    const entropy = new JpegEntropy(32, 32, at420);
    const chroma = scan({ components: [{ index: 1, dc: dc0, ac: eob }], restartInterval: 2 });
    const data = intervals(2, 4);
    expect(entropy.scanFault(data, 0, chroma)).toBeUndefined();
    data[2] = 0xd1;
    expect(entropy.scanFault(data, 0, chroma)).toBe("restart");
  });
});

describe("JpegEntropy bounds", () => {
  test("refuses a progressive frame past the block cap before keeping any history", () => {
    // 8192 x 1025 blocks of one component: one row of blocks past 2^23.
    const entropy = new JpegEntropy(65535, 8200, [{ h: 1, v: 1 }]);
    const ac = scan({
      progressive: true,
      start: 1,
      end: 63,
      components: [{ index: 0, dc: undefined, ac: eob }],
    });
    expect(entropy.scanFault(new Uint8Array([0xff, 0xd9]), 0, ac)).toBe("history");
    expect(maxProgressiveBlocks).toBe(2 ** 23);
  });

  test("stops a crafted progressive file at the step cap, quickly", () => {
    // 8192 x 1024 blocks (the cap exactly): refinement scans of empty bands each visit every block.
    const entropy = new JpegEntropy(65535, 8192, [{ h: 1, v: 1 }]);
    const refine = scan({
      progressive: true,
      start: 1,
      end: 63,
      high: 1,
      low: 0,
      components: [{ index: 0, dc: undefined, ac: eob14 }],
    });
    // EOB14 with its 14 bits all ones covers 32767 blocks; 257 of them cover every block.
    const symbol = "0" + "1".repeat(14);
    const text = symbol.repeat(257);
    const padded = text + "1".repeat((8 - (text.length % 8)) % 8);
    const bytes: number[] = [];
    for (let at = 0; at < padded.length; at += 8) {
      const byte = Number.parseInt(padded.slice(at, at + 8), 2);
      bytes.push(...(byte === 0xff ? [0xff, 0] : [byte]));
    }
    const data = new Uint8Array([...bytes, 0xff, 0xd9]);
    const {
      value: { fault, scans },
      ms: elapsed,
      scale,
    } = timed(() => {
      let fault;
      let scans = 0;
      while (fault === undefined && scans < 64) {
        fault = entropy.scanFault(data, 0, refine);
        scans++;
      }
      return { fault, scans };
    });
    expect(fault).toBe("steps");
    expect(scans).toBe(Math.floor(maxEntropySteps / 2 ** 23) + 1);
    expect(elapsed).toBeLessThan(3000 * scale);
  });

  test("costs one step for a run of empty bands in a first AC scan", () => {
    const entropy = new JpegEntropy(65535, 8192, [{ h: 1, v: 1 }]);
    const first = scan({
      progressive: true,
      start: 1,
      end: 63,
      components: [{ index: 0, dc: undefined, ac: eob14 }],
    });
    // EOB14 with its 14 bits all zeros covers 16384 blocks; 512 of them cover every block.
    const bytes = new Array<number>(Math.ceil((512 * 15) / 8)).fill(0x00);
    const data = new Uint8Array([...bytes, 0xff, 0xd9]);
    // Hundreds of scans over 2^23 blocks each stay far below the step cap: runs, not blocks, are counted.
    for (let index = 0; index < 200; index++)
      expect(entropy.scanFault(data, 0, first)).toBeUndefined();
  });
});

describe("the limits in the sniffer's message", () => {
  const segment = (marker: number, body: readonly number[]) => [
    0xff,
    marker,
    (body.length + 2) >> 8,
    (body.length + 2) & 0xff,
    ...body,
  ];

  test("a progressive frame past the block cap is refused naming it", () => {
    // 65535 x 8200 grey: 8192 x 1025 blocks, its first scan an AC one.
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
      ...segment(0xc2, [8, 0x20, 0x08, 0xff, 0xff, 1, 1, 0x11, 0]),
      ...segment(0xc4, [0x10, 1, ...new Array<number>(15).fill(0), 0]),
      ...segment(0xda, [1, 1, 0x00, 1, 63, 0]),
      0x00,
      0xff,
      0xd9,
    ]);
    const result = sniffImage(jpeg, 1);
    expect(result.ok ? "" : result.message).toBe(
      "JPEG progressive frame of more than 8388608 blocks is refused",
    );
  });

  test("the step cap is named", () => {
    expect(entropyRefusal("steps")).toBe(
      "JPEG image data that takes more than 134217728 decoding steps is refused",
    );
  });
});

describe("the column-pair sums of a progressive block", () => {
  const quant = (entry: number) => new Uint16Array(64).fill(entry);

  test("a DC refinement bit adds its weight to column pair 0 only where it is set", () => {
    const sums = Int32Array.of(maxColumnPairSum - 7, 0, 0, 0);
    expect(
      dcRefineBlock(new EntropyBits(Uint8Array.of(0x7f, 0xff, 0xd9), 0), 0, quant(8), sums),
    ).toBeUndefined();
    expect(sums[0]).toBe(maxColumnPairSum - 7);
    expect(
      dcRefineBlock(new EntropyBits(Uint8Array.of(0x80, 0xff, 0xd9), 0), 0, quant(8), sums),
    ).toBe("columns");
  });

  test("the correction bits of an end-of-band run go to their own block and column pair", () => {
    // Block 1 holds zigzag 2 (column 0) and 4 (column 1); the bits 1 and 0 refine only the first, by 2 x 4.
    const history = new Uint32Array(4);
    history[2] = (1 << 2) | (1 << 4);
    const sums = new Uint16Array(8);
    const bits = new EntropyBits(Uint8Array.of(0b10111111, 0xff, 0xd9), 0);
    expect(runCorrections(bits, history, 0, 2, [1, 63], 1, quant(4), sums)).toBeUndefined();
    expect([...sums]).toEqual([0, 0, 0, 0, 8, 0, 0, 0]);
  });
});
