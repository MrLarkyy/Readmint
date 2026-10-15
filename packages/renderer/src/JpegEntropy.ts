import { EntropyBits } from "./EntropyBits.js";
import type { EntropyBudget } from "./EntropyBudget.js";
import type { HuffmanTable } from "./HuffmanTable.js";
import {
  acFirstBlock,
  acRefineBlock,
  type BlockFault,
  dcFirstBlock,
  runCorrections,
  sequentialBlock,
} from "./entropyBlocks.js";

/**
 * Most decoding steps (2^27: block and MCU visits, end-of-band runs) the entropy check spends on one file: far above
 * what a 4 MiB file of the largest image the raster output takes (268,435,456 pixels, 6.3 million 4:2:0 blocks) needs
 * over a usual progression, and a bound on the time a crafted one costs.
 */
export const maxEntropySteps = 134_217_728;
/**
 * Most blocks (2^23) a progressive frame may hold over all its components: the check keeps two words per block of
 * which coefficients are nonzero (64 MiB at most), which covers 4:2:0 at the raster output's largest image.
 */
export const maxProgressiveBlocks = 8_388_608;

/** A frame component as the entropy check needs it. */
export interface EntropyComponent {
  readonly h: number;
  readonly v: number;
}

/**
 * One component of a scan: its place in the frame, the Huffman tables the scan gives it and the entries of its
 * quantization table in zigzag order (undefined where no DQT defines it, which the marker walk refuses).
 */
export interface ScanComponent {
  readonly index: number;
  readonly dc: HuffmanTable | undefined;
  readonly ac: HuffmanTable | undefined;
  readonly quant?: Uint16Array | undefined;
}

/**
 * A scan header as the entropy check needs it: of a progressive (SOF2) frame or not, spectral selection, successive
 * approximation, the restart interval in force.
 */
export interface EntropyScan {
  readonly progressive: boolean;
  readonly components: readonly ScanComponent[];
  readonly start: number;
  readonly end: number;
  readonly high: number;
  readonly low: number;
  readonly restartInterval: number;
}

/** What the entropy check finds wrong: a fault of a block, of the data around the blocks, or a limit. */
export type EntropyFault =
  | BlockFault
  | "marker"
  | "restart"
  | "restart-data"
  | "block-count"
  | "steps"
  | "budget"
  | "history";

interface Walk {
  readonly bits: EntropyBits;
  readonly scan: EntropyScan;
  readonly predictors: Int32Array;
  eobRun: number;
}

/**
 * The Huffman symbols of every scan of one frame, decoded and not dequantized (no pixels), walked block by block as
 * libjpeg-turbo 3.1 (Chromium) and jpeg-decoder 0.3.1 (resvg) walk them: MCU order, restart intervals, end-of-band
 * runs and the refinement correction bits, which take the history of nonzero coefficients per block. It finds where
 * the two decoders part ways (`EntropyFault`). Past the last block both ignore the padding bits and skip any bytes up
 * to the next marker, so the check ends there. Where the data runs out without a marker it finds nothing: the marker
 * walk rules on a cut file. Its steps count against `maxEntropySteps` for the file and against `budget`, shared by
 * every image of a render, where one is given.
 */
export class JpegEntropy {
  private steps = 0;
  /** Where the current scan stops: the file's cap or what the shared budget has left, the lower. */
  private cap = maxEntropySteps;
  private charged = 0;
  private readonly hMax: number;
  private readonly vMax: number;
  private readonly histories: (Uint32Array | undefined)[] = [];

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly components: readonly EntropyComponent[],
    private readonly budget?: EntropyBudget,
  ) {
    this.hMax = Math.max(...components.map(({ h }) => h));
    this.vMax = Math.max(...components.map(({ v }) => v));
  }

  /** The fault of the scan whose image data starts at `start`, or undefined. */
  scanFault(data: Uint8Array, start: number, scan: EntropyScan): EntropyFault | undefined {
    const walk: Walk = {
      bits: new EntropyBits(data, start),
      scan,
      predictors: new Int32Array(scan.components.length),
      eobRun: 0,
    };
    this.open();
    return this.close(
      scan.components.length > 1 ? this.interleaved(walk) : this.nonInterleaved(walk),
    );
  }

  /**
   * The fault of the image data of a lossless scan at `start`: one difference per sample of three components at 1x1,
   * on `table`, no restart interval (`LosslessJpeg` refuses one).
   */
  losslessFault(data: Uint8Array, start: number, table: HuffmanTable): EntropyFault | undefined {
    this.open();
    return this.close(this.losslessWalk(new EntropyBits(data, start), table));
  }

  private losslessWalk(bits: EntropyBits, table: HuffmanTable): EntropyFault | undefined {
    for (let pixel = 0; pixel < this.width * this.height; pixel++) {
      if (++this.steps > this.cap) return this.overCap();
      for (let sample = 0; sample < 3; sample++) {
        const category = table.decode(bits);
        if (category === undefined) return stopFault(bits, "code");
        if (category < 16) bits.skip(category);
      }
      if (bits.overrun) return stopFault(bits, undefined);
    }
    return undefined;
  }

  private interleaved(walk: Walk): EntropyFault | undefined {
    const across = Math.ceil(this.width / (8 * this.hMax));
    const down = Math.ceil(this.height / (8 * this.vMax));
    const sampled = walk.scan.components.map(({ index }) => this.components[index]);
    for (let mcu = 0; mcu < across * down; mcu++) {
      const restart = restartFault(walk, mcu);
      if (restart !== undefined) return restart;
      if (++this.steps > this.cap) return this.overCap();
      for (const [position, component] of walk.scan.components.entries()) {
        const blocks = (sampled[position]?.h ?? 1) * (sampled[position]?.v ?? 1);
        for (let block = 0; block < blocks; block++) {
          const fault = dcBlock(walk, component, position);
          if (fault !== undefined) return stopFault(walk.bits, fault);
        }
      }
      if (walk.bits.overrun) return stopFault(walk.bits, undefined);
    }
    return undefined;
  }

  private nonInterleaved(walk: Walk): EntropyFault | undefined {
    const component = walk.scan.components[0];
    const sampling = component === undefined ? undefined : this.components[component.index];
    if (component === undefined || sampling === undefined) return undefined;
    const [across, down] = this.blocksOf(sampling);
    // jpeg-decoder counts the blocks of a non-interleaved scan from its MCU-padded size, cut where the image ends.
    const decoderAcross = Math.min(
      Math.ceil(this.width / (8 * this.hMax)) * sampling.h,
      Math.ceil(this.width / 8),
    );
    const decoderDown = Math.min(
      Math.ceil(this.height / (8 * this.vMax)) * sampling.v,
      Math.ceil(this.height / 8),
    );
    if (across !== decoderAcross || down !== decoderDown) return "block-count";
    const blocks = across * down;
    const ac = walk.scan.start > 0;
    const history = ac ? this.history(component.index) : undefined;
    if (ac && history === undefined) return "history";
    for (let block = 0; block < blocks; block++) {
      const restart = restartFault(walk, block);
      if (restart !== undefined) return restart;
      if (++this.steps > this.cap) return this.overCap();
      if (history !== undefined && walk.eobRun > 0) {
        const run = Math.min(walk.eobRun, blocks - block, untilRestart(walk.scan, block));
        if (walk.scan.high > 0) {
          // Each block of a refinement run takes a correction bit per coefficient of the band already nonzero.
          walk.bits.skip(runCorrections(history, block, run, [walk.scan.start, walk.scan.end]));
          this.steps += run - 1;
          if (this.steps > this.cap) return this.overCap();
          if (walk.bits.overrun) return stopFault(walk.bits, undefined);
        }
        // A run in a first scan costs one step, whatever its length: no bits, no history.
        walk.eobRun -= run;
        block += run - 1;
        continue;
      }
      const fault =
        history === undefined
          ? dcBlock(walk, component, 0)
          : acBlock(walk, component, history, block);
      if (fault !== undefined) return stopFault(walk.bits, fault);
      if (walk.bits.overrun) return stopFault(walk.bits, undefined);
    }
    return undefined;
  }

  /** Before a scan: its cap, from the file's and what the shared budget has left. */
  private open(): void {
    this.cap = Math.min(maxEntropySteps, this.steps + (this.budget?.remaining ?? Infinity));
  }

  /** After a scan: its steps charged to the shared budget. */
  private close(fault: EntropyFault | undefined): EntropyFault | undefined {
    if (this.budget !== undefined) {
      this.budget.remaining = Math.max(0, this.budget.remaining - (this.steps - this.charged));
    }
    this.charged = this.steps;
    return fault;
  }

  /** The fault of a scan past its cap: the file's own, else the shared budget's, which is then spent. */
  private overCap(): EntropyFault {
    if (this.steps > maxEntropySteps) return "steps";
    if (this.budget !== undefined) this.budget.exhausted = true;
    return "budget";
  }

  /** The blocks across and down a non-interleaved scan of `component` holds, as libjpeg counts them. */
  private blocksOf(component: EntropyComponent): readonly [number, number] {
    return [
      Math.ceil((this.width * component.h) / (8 * this.hMax)),
      Math.ceil((this.height * component.v) / (8 * this.vMax)),
    ];
  }

  /** The nonzero history of component `index`, made at its first AC scan; undefined past `maxProgressiveBlocks`. */
  private history(index: number): Uint32Array | undefined {
    const known = this.histories[index];
    if (known !== undefined) return known;
    const total = this.components.reduce((sum, component) => {
      const [across, down] = this.blocksOf(component);
      return sum + across * down;
    }, 0);
    if (total > maxProgressiveBlocks) return undefined;
    const [across, down] = this.blocksOf(this.components[index] ?? { h: 1, v: 1 });
    const history = new Uint32Array(2 * across * down);
    this.histories[index] = history;
    return history;
  }
}

/** One block of a scan that holds the DC coefficient: sequential, first DC or DC refinement. */
function dcBlock(walk: Walk, component: ScanComponent, position: number): BlockFault | undefined {
  const { bits, scan, predictors } = walk;
  if (scan.high > 0) {
    bits.skip(1);
    return undefined;
  }
  if (component.dc === undefined) return undefined;
  if (scan.progressive) {
    return dcFirstBlock(bits, component.dc, predictors, position, scan.low, component.quant);
  }
  if (component.ac === undefined) return undefined;
  return sequentialBlock(bits, component.dc, component.ac, predictors, position, component.quant);
}

/** One block of an AC scan outside an end-of-band run. */
function acBlock(
  walk: Walk,
  component: ScanComponent,
  history: Uint32Array,
  block: number,
): BlockFault | undefined {
  const { bits, scan } = walk;
  const band = [scan.start, scan.end] as const;
  if (component.ac === undefined) return undefined;
  const result =
    scan.high > 0
      ? acRefineBlock(bits, component.ac, band, scan.low, history, block, component.quant)
      : acFirstBlock(bits, component.ac, band, scan.low, history, block, component.quant);
  if (typeof result !== "number") return result;
  walk.eobRun = result;
  return undefined;
}

/** MCUs from MCU `mcu` up to the next restart marker, or Infinity without restarts. */
function untilRestart(scan: EntropyScan, mcu: number): number {
  if (scan.restartInterval === 0) return Infinity;
  return scan.restartInterval - (mcu % scan.restartInterval);
}

/**
 * Before MCU `mcu`: where a restart interval ends there, the restart marker in sequence must follow the data, right
 * after its padding bits, and the predictors and the end-of-band run start over.
 */
function restartFault(walk: Walk, mcu: number): EntropyFault | undefined {
  const interval = walk.scan.restartInterval;
  if (interval === 0 || mcu === 0 || mcu % interval !== 0) return undefined;
  const { bits } = walk;
  const index = (mcu / interval - 1) % 8;
  bits.align();
  if (bits.moreData()) {
    bits.skipToStop();
    return bits.marker === 0xd0 + index ? "restart-data" : "restart";
  }
  if (!bits.restart(index)) return bits.atMarker ? "restart" : undefined;
  walk.predictors.fill(0);
  walk.eobRun = 0;
  return undefined;
}

/**
 * `fault` where the data held what the walk read; where a read ran past a marker (or a code matched none only with the
 * padding past it), `marker`: the data is cut short. Past the end of the bytes, or at fill bytes before a stuffed zero,
 * nothing: the marker walk rules on those.
 */
function stopFault(bits: EntropyBits, fault: EntropyFault | undefined): EntropyFault | undefined {
  if (!bits.overrun && !(fault === "code" && bits.short)) return fault;
  return bits.atMarker && bits.marker !== 0 ? "marker" : undefined;
}
