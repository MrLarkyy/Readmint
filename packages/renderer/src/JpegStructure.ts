import type { Bytes } from "./Bytes.js";
import type { EntropyBudget } from "./EntropyBudget.js";
import { HuffmanTable } from "./HuffmanTable.js";
import { type EntropyScan, JpegEntropy } from "./JpegEntropy.js";
import { entropyRefusal, resvgDiffers, undrawable } from "./jpegRefusals.js";
import type { LosslessJpeg } from "./LosslessJpeg.js";
import { nextJpegMarker } from "./nextJpegMarker.js";
import { skipEntropyData } from "./skipEntropyData.js";
import { standardHuffmanTables } from "./standardHuffmanTables.js";

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;

const baselineTable = (table: number, where: string) =>
  `JPEG baseline (SOF0) ${where} Huffman table ${String(table)}, which is refused, because resvg draws it empty; ` +
  "baseline allows tables 0 and 1";

type Colour = "RGB" | "YCbCr";

interface Component {
  readonly id: number;
  readonly h: number;
  readonly v: number;
  readonly table: number;
  /** The coefficients 0-63 a scan with no successive approximation left to do has delivered. */
  readonly done: boolean[];
  /** The definition of its quantization table its first scan saw: libjpeg keeps it, jpeg-decoder takes the latest. */
  latched: number | undefined;
}

/** JFIF and the last Adobe transform as one decoder reads them. */
interface ColourMarks {
  jfif: boolean;
  adobe: number | undefined;
}

const isAppOrTable = (marker: number) =>
  marker === 0xc4 ||
  marker === 0xdb ||
  marker === 0xdd ||
  marker === 0xfe ||
  (marker >= 0xe0 && marker <= 0xef);

/**
 * The JPEG structure from the start of the file to EOI, held to what Chromium (libjpeg-turbo 3.1) and resvg-wasm 2.6.2
 * (jpeg-decoder 0.3.1) both draw alike: every DHT, DQT, DRI, APP0 and APP14 segment on either side of the frame header
 * and of every scan, the frame, every scan header, the markers between scans, and at EOI the scan coverage and the
 * colour space each decoder picks. jpeg-decoder rejects much that libjpeg reads or ignores (an unused Huffman or
 * quantization table it cannot build, an Adobe transform above 2, a marker after the image data other than a table,
 * APPn, COM or a restart right after the data, a sequential scan with spectral or successive approximation values,
 * scan components out of frame order, a component left incomplete or scanned after it is complete, CMYK) and reads
 * JFIF, Adobe and the component ids in another order and up to EOI, where libjpeg stops at the first scan. The image
 * data of every scan is decoded to its Huffman symbols by `JpegEntropy`, which refuses where the two decoders part
 * ways on it. A sequential (SOF0, SOF1) file cut before EOI draws nothing in both, so its walk just ends; of a
 * progressive one cut before EOI Chromium draws what its scans hold and resvg nothing, so it is refused (lossless:
 * `LosslessJpeg`). Each rule is pinned against both outputs in test/jpegStructureCases.ts, test/jpegMarkers.ts and
 * test/jpegEntropyCases.ts (Chromium 156, resvg-wasm 2.6.2).
 */
export class JpegStructure {
  private frame: number | undefined;
  private components: Component[] = [];
  /** The Huffman tables defined so far. */
  private readonly dcTables = new Map<number, HuffmanTable>();
  private readonly acTables = new Map<number, HuffmanTable>();
  /** The restart interval of the latest DRI. */
  private restartInterval = 0;
  /** The symbol check of the image data; none for a frame of zero size, which the sniffer refuses. */
  private entropy: JpegEntropy | undefined;
  /** An AVI1 APP0 (Motion JPEG) has been read: jpeg-decoder then fills in the default tables 0 and 1. */
  private mjpeg = false;
  /** How often each quantization table has been defined. */
  private readonly quantTables = new Map<number, number>();
  /** The entries of each quantization table's latest definition, in zigzag order. */
  private readonly quantEntries = new Map<number, Uint16Array>();
  private readonly libjpeg: ColourMarks = { jfif: false, adobe: undefined };
  private readonly decoder: ColourMarks = { jfif: false, adobe: undefined };
  private scanned = false;

  /** @param budget the symbol-check steps the render has left, shared by all its images; none, the file's cap only */
  constructor(private readonly budget?: EntropyBudget) {}

  /** Why the length segment of `marker` at `offset` (its length field) is refused, or undefined. */
  segmentProblem(marker: number, bytes: Bytes, offset: number, length: number): string | undefined {
    if (marker === 0xdb) return this.quantizationProblem(bytes, offset, length);
    if (marker === 0xc4) return this.huffmanProblem(bytes, offset, length);
    if (marker === 0xdd) {
      if (length !== 4) return undrawable("restart interval segment of an invalid length");
      this.restartInterval = bytes.u16be(offset + 2);
    }
    if (marker === 0xe0) this.readApp0(bytes, offset + 2, length - 2);
    if (marker === 0xee) return this.adobeProblem(bytes, offset + 2, length - 2);
    return undefined;
  }

  /**
   * Why the frame header of `marker` at `offset` (its length field, its precision and length already checked) is
   * refused, or undefined. A lossless frame is the \`LosslessJpeg\` rule's.
   */
  frameProblem(marker: number, bytes: Bytes, offset: number): string | undefined {
    this.frame = marker;
    const count = bytes.u8(offset + 7);
    for (let index = 0; index < count; index++) {
      const at = offset + 8 + 3 * index;
      const sampling = bytes.u8(at + 1);
      const done = new Array<boolean>(64).fill(false);
      this.components.push({
        id: bytes.u8(at),
        h: sampling >> 4,
        v: sampling & 0x0f,
        table: bytes.u8(at + 2),
        done,
        latched: undefined,
      });
    }
    const height = bytes.u16be(offset + 3);
    const width = bytes.u16be(offset + 5);
    if (width > 0 && height > 0) {
      this.entropy = new JpegEntropy(width, height, this.components, this.budget);
    }
    if (marker === 0xc3) return undefined;
    if (count === 4)
      return resvgDiffers("frame of 4 components (CMYK or YCCK), which resvg draws empty,");
    if (count !== 1 && count !== 3) return undrawable(`frame of ${String(count)} components`);
    const ids = this.components.map((component) => component.id);
    if (new Set(ids).size !== ids.length)
      return resvgDiffers(`frame with the component ids ${ids.join(" ")}`);
    const hMax = Math.max(...this.components.map((component) => component.h));
    const vMax = Math.max(...this.components.map((component) => component.v));
    for (const { id, h, v, table } of this.components) {
      if (h < 1 || h > 4 || v < 1 || v > 4 || hMax % h !== 0 || vMax % v !== 0) {
        return undrawable(
          `frame whose component ${String(id)} is sampled ${String(h)}x${String(v)}`,
        );
      }
      if (table > 3) return undrawable(`frame with quantization table ${String(table)}`);
    }
    return undefined;
  }

  /**
   * Why the file is refused from its first scan header at `offset` (its length field) on, or undefined: every scan
   * header, the image data skipped in one pass, the markers between the scans and at EOI the whole file. Where the
   * data runs out, the walk ends with `cutProblem`.
   */
  scansProblem(bytes: Bytes, offset: number, lossless: LosslessJpeg): string | undefined {
    if (lossless.lossless) {
      const problem = lossless.problemAtScan(bytes, offset);
      if (problem !== undefined) return problem;
      const tableProblem = this.tableProblem("DC", 0, false, 16);
      if (tableProblem !== undefined) return tableProblem;
      const data = offset + bytes.u16be(offset);
      const table = this.dcTables.get(0);
      const fault =
        table === undefined ? undefined : this.entropy?.losslessFault(bytes.data, data, table);
      if (fault !== undefined) return entropyRefusal(fault);
      const end = skipEntropyData(bytes.data, data, false);
      return lossless.problemAfterImageData(end?.marker);
    }
    let scan = offset;
    for (;;) {
      const scanProblem = this.scanProblem(bytes, scan);
      if (scanProblem !== undefined) return scanProblem;
      const data = scan + bytes.u16be(scan);
      const fault = this.entropy?.scanFault(bytes.data, data, this.entropyScan(bytes, scan));
      if (fault !== undefined) return entropyRefusal(fault);
      let next = skipEntropyData(bytes.data, data, true);
      for (;;) {
        if (next === undefined) return this.cutProblem();
        const marker = next.marker;
        if (marker === 0) return resvgDiffers("image data with fill bytes before a stuffed zero");
        if (marker === 0xd9) return this.endProblem();
        if (marker === 0xda) break;
        if (!isAppOrTable(marker)) {
          // libjpeg skips RSTn, TEM and DNL past the image data and draws what it has; jpeg-decoder stops.
          return resvgDiffers(`marker ${hex(marker)} after the image data`);
        }
        const length = bytes.u16be(next.offset);
        if (length < 2) return undrawable(`segment ${hex(marker)} of an invalid length`);
        const segmentProblem = this.segmentProblem(marker, bytes, next.offset, length);
        if (segmentProblem !== undefined) return segmentProblem;
        next = nextJpegMarker(bytes, next.offset + length, true);
      }
      scan = next.offset;
    }
  }

  /**
   * Why a file of this frame that ends before EOI is refused, or undefined: neither output draws a cut sequential file,
   * Chromium draws what the scans of a cut progressive one hold and resvg nothing.
   */
  cutProblem(): string | undefined {
    return this.frame === 0xc2
      ? resvgDiffers("progressive file that ends before its end-of-image marker")
      : undefined;
  }

  private quantizationProblem(bytes: Bytes, offset: number, length: number): string | undefined {
    const end = offset + length;
    for (let at = offset + 2; at < end;) {
      const precision = bytes.u8(at) >> 4;
      const table = bytes.u8(at) & 0x0f;
      if (table > 3) return undrawable(`quantization table ${String(table)}`);
      if (precision > 1)
        return resvgDiffers(`quantization table of precision ${String(precision)}`);
      const size = 64 * (precision + 1);
      if (end - at - 1 < size) return undrawable("quantization table segment of an invalid length");
      const entries = new Uint16Array(64);
      for (let entry = 0; entry < 64; entry++) {
        const value = precision === 0 ? bytes.u8(at + 1 + entry) : bytes.u16be(at + 1 + 2 * entry);
        if (value === 0)
          return resvgDiffers(`quantization table ${String(table)} with a zero entry`);
        entries[entry] = value;
      }
      this.quantEntries.set(table, entries);
      this.quantTables.set(table, (this.quantTables.get(table) ?? 0) + 1);
      at += 1 + size;
    }
    return undefined;
  }

  private huffmanProblem(bytes: Bytes, offset: number, length: number): string | undefined {
    const end = offset + length;
    for (let at = offset + 2; at < end;) {
      // Both fail on fewer than 17 bytes left; 17 (a table without codes) libjpeg reads, jpeg-decoder fails on.
      if (end - at < 17) return undrawable("Huffman table segment of an invalid length");
      const id = bytes.u8(at);
      const table = id & 0x0f;
      if (id >> 4 > 1 || table > 3) return undrawable(`Huffman table id ${hex(id)}`);
      if (this.frame === 0xc0 && table > 1) {
        return baselineTable(table, "defines, after its frame header,");
      }
      let codes = 0;
      let code = 0;
      let allOnes = false;
      for (let bits = 1; bits <= 16; bits++) {
        const count = bytes.u8(at + bits);
        codes += count;
        code = code * 2 + count;
        // jpeg-decoder builds every table where it is defined and fails on more codes than fit; a code of all ones it
        // takes, libjpeg fails on it only in a scan that uses the table.
        if (code > 1 << bits)
          return resvgDiffers(`Huffman table ${hex(id)} of invalid code lengths`);
        if (code === 1 << bits && count > 0) allOnes = true;
      }
      if (codes === 0) return resvgDiffers(`Huffman table ${hex(id)} without codes`);
      if (codes > 256 || codes > end - at - 17) {
        return undrawable("Huffman table segment of an invalid length");
      }
      const counts = Array.from({ length: 16 }, (_, index) => bytes.u8(at + 1 + index));
      const symbols = bytes.data.slice(at + 17, at + 17 + codes);
      (id >> 4 === 0 ? this.dcTables : this.acTables).set(
        table,
        new HuffmanTable(counts, symbols, allOnes),
      );
      at += 17 + codes;
    }
    return undefined;
  }

  private readApp0(bytes: Bytes, start: number, size: number): void {
    if (size < 5) return;
    const name = bytes.ascii(start, 5);
    if (name === "AVI1\0") this.mjpeg = true;
    if (name !== "JFIF\0") return;
    this.decoder.jfif = true;
    if (!this.scanned && size >= 14) this.libjpeg.jfif = true;
  }

  private adobeProblem(bytes: Bytes, start: number, size: number): string | undefined {
    if (size < 12 || bytes.ascii(start, 5) !== "Adobe") return undefined;
    const transform = bytes.u8(start + 11);
    if (!this.scanned) this.libjpeg.adobe = transform;
    // jpeg-decoder takes the sixth byte into the match; libjpeg does not.
    if (bytes.u8(start + 5) !== 0) return undefined;
    if (transform > 2) return resvgDiffers(`Adobe transform ${String(transform)}`);
    this.decoder.adobe = transform;
    return undefined;
  }

  private scanProblem(bytes: Bytes, offset: number): string | undefined {
    this.scanned = true;
    const count = bytes.u8(offset + 2);
    if (count < 1 || count > 4 || bytes.u16be(offset) !== 6 + 2 * count) {
      return undrawable("scan header of an invalid length");
    }
    const parameters = offset + 3 + 2 * count;
    const start = bytes.u8(parameters);
    const end = bytes.u8(parameters + 1);
    const high = bytes.u8(parameters + 2) >> 4;
    const low = bytes.u8(parameters + 2) & 0x0f;
    const progressive = this.frame === 0xc2;
    const band = progressive ? [start, end] : [0, 63];
    const parametersProblem = progressive
      ? progressiveProblem(count, start, end, high, low)
      : start !== 0 || (end !== 0 && end !== 63) || high !== 0 || low !== 0
        ? resvgDiffers(
            `sequential scan with spectral selection ${String(start)}-${String(end)} and successive ` +
              `approximation ${String(high)}/${String(low)}`,
          )
        : undefined;
    if (parametersProblem !== undefined) return parametersProblem;
    const scanned: Component[] = [];
    let previous = -1;
    for (let index = 0; index < count; index++) {
      const id = bytes.u8(offset + 3 + 2 * index);
      const tables = bytes.u8(offset + 4 + 2 * index);
      const position = this.components.findIndex((component) => component.id === id);
      const component = this.components[position];
      if (component === undefined)
        return undrawable(`scan of component ${String(id)}, which the frame lacks`);
      if (position <= previous) return undrawable("scan of components out of frame order");
      previous = position;
      const dc = tables >> 4;
      const ac = tables & 0x0f;
      if (dc > 3 || ac > 3) return undrawable(`scan with Huffman table selector ${hex(tables)}`);
      if (this.frame === 0xc0 && Math.max(dc, ac) > 1)
        return baselineTable(Math.max(dc, ac), "scan selects");
      // libjpeg builds a DC table only for a scan that decodes DC differences, and then refuses a category above 15.
      const largest = !progressive || high === 0 ? 15 : undefined;
      const tableProblem =
        (band[0] === 0 ? this.tableProblem("DC", dc, !progressive, largest) : undefined) ??
        ((band[1] ?? 0) > 0 ? this.tableProblem("AC", ac, !progressive) : undefined);
      if (tableProblem !== undefined) return tableProblem;
      const definition = this.quantTables.get(component.table);
      if (definition === undefined) {
        return undrawable(
          `scan of a component on quantization table ${String(component.table)}, which no DQT defines,`,
        );
      }
      if (component.latched !== undefined && component.latched !== definition) {
        return resvgDiffers(
          `quantization table ${String(component.table)} redefined between two scans of a component`,
        );
      }
      // jpeg-decoder skips a scan of a component it has completed; libjpeg applies it.
      if (component.done.every(Boolean)) {
        return resvgDiffers(`scan of component ${String(id)} after it is complete`);
      }
      scanned.push(component);
    }
    if (count > 1 && scanned.reduce((blocks, { h, v }) => blocks + h * v, 0) > 10) {
      return undrawable("scan of more than 10 blocks per MCU");
    }
    for (const component of scanned) {
      component.latched ??= this.quantTables.get(component.table);
      if (low === 0) component.done.fill(true, band[0], (band[1] ?? 0) + 1);
    }
    return undefined;
  }

  /**
   * Why a scan on Huffman `table` of `kind` is refused, or undefined. Where no DHT defines it, libjpeg-turbo fills in
   * its default tables 0 and 1 for a sequential scan (jdhuff.c:823), jpeg-decoder only after an AVI1 APP0
   * (decoder.rs:817), for any scan. Where libjpeg builds the table for decoding, a symbol above `largest` fails it
   * (jdhuff.c:257); jpeg-decoder fails only on decoding one.
   */
  private tableProblem(
    kind: "DC" | "AC",
    table: number,
    sequential: boolean,
    largest?: number,
  ): string | undefined {
    const found = this.table(kind, table, sequential);
    const name = `${kind} Huffman table ${String(table)}`;
    if (found === undefined) return resvgDiffers(`scan on ${name}, which no DHT defines,`);
    if (found.allOnes) return resvgDiffers(`scan on ${name}, which has a code of all ones,`);
    if (largest !== undefined && found.largestSymbol > largest) {
      return resvgDiffers(`scan on ${name}, which holds a category above ${String(largest)},`);
    }
    return undefined;
  }

  /** The Huffman table a scan decodes with: the DHT's, else the default one a Motion JPEG frame brings. */
  private table(kind: "DC" | "AC", table: number, sequential: boolean): HuffmanTable | undefined {
    const defined = (kind === "DC" ? this.dcTables : this.acTables).get(table);
    if (defined !== undefined || !sequential || !this.mjpeg) return defined;
    return (kind === "DC" ? standardHuffmanTables.dc : standardHuffmanTables.ac)[table];
  }

  /** The scan header at `offset` (its length field, checked by `scanProblem`) as the entropy check reads it. */
  private entropyScan(bytes: Bytes, offset: number): EntropyScan {
    const count = bytes.u8(offset + 2);
    const parameters = offset + 3 + 2 * count;
    const progressive = this.frame === 0xc2;
    const components = Array.from({ length: count }, (_, position) => {
      const id = bytes.u8(offset + 3 + 2 * position);
      const tables = bytes.u8(offset + 4 + 2 * position);
      const index = this.components.findIndex((component) => component.id === id);
      const quantTable = this.components[index]?.table;
      return {
        index,
        dc: this.table("DC", tables >> 4, !progressive),
        ac: this.table("AC", tables & 0x0f, !progressive),
        quant: quantTable === undefined ? undefined : this.quantEntries.get(quantTable),
      };
    });
    return {
      progressive,
      components,
      start: bytes.u8(parameters),
      end: bytes.u8(parameters + 1),
      high: bytes.u8(parameters + 2) >> 4,
      low: bytes.u8(parameters + 2) & 0x0f,
      restartInterval: this.restartInterval,
    };
  }

  private endProblem(): string | undefined {
    for (const component of this.components) {
      // libjpeg draws what the scans delivered, jpeg-decoder nothing for a component it has not completed.
      if (!component.done.every(Boolean)) {
        return resvgDiffers(
          `file whose component ${String(component.id)} is never completely scanned`,
        );
      }
    }
    if (this.components.length !== 3) return undefined;
    const ids = this.components.map((component) => component.id);
    const chromium = libjpegColour(ids, this.libjpeg);
    const resvg = decoderColour(ids, this.decoder);
    if (chromium === resvg) return undefined;
    return resvgDiffers(
      `file whose colours Chromium reads as ${chromium} and resvg ${resvg === undefined ? "not at all" : `as ${resvg}`}` +
        ` (component ids ${ids.join(" ")}, JFIF, Adobe transform)`,
    );
  }
}

/** jpeg-decoder's progressive scan checks (parser.rs:406-424); libjpeg fails on nearly all of them too. */
function progressiveProblem(
  count: number,
  start: number,
  end: number,
  high: number,
  low: number,
): string | undefined {
  const bad =
    end > 63 ||
    start > end ||
    (start === 0 && end !== 0) ||
    (start !== 0 && count !== 1) ||
    high > 13 ||
    low > 13 ||
    (high !== 0 && high !== low + 1);
  return bad
    ? undrawable(
        `progressive scan with spectral selection ${String(start)}-${String(end)} and successive approximation ` +
          `${String(high)}/${String(low)}`,
      )
    : undefined;
}

/** libjpeg-turbo 3.1 jdapimin.c default_decompress_parms, 3 components, from the markers before the first scan. */
function libjpegColour(ids: readonly number[], marks: ColourMarks): Colour {
  if (marks.jfif) return "YCbCr";
  if (marks.adobe !== undefined) return marks.adobe === 0 ? "RGB" : "YCbCr";
  return ids.join() === "82,71,66" ? "RGB" : "YCbCr";
}

/** jpeg-decoder 0.3.1 determine_color_transform (decoder.rs:698-765), 3 components, from the markers up to EOI. */
function decoderColour(ids: readonly number[], marks: ColourMarks): Colour | undefined {
  const key = ids.join();
  if (key === "1,2,3") return "YCbCr";
  if (key === "82,71,66") return "RGB";
  if (key === "1,34,35" || key === "114,103,98") return undefined;
  if (marks.jfif) return "YCbCr";
  if (marks.adobe === 0) return "RGB";
  if (marks.adobe === 2) return undefined;
  return "YCbCr";
}
