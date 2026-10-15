import type { Bytes } from "./Bytes.js";

/** Component ids `R` `G` `B`: RGB under every colour rule of libjpeg, libjpeg-turbo and jpeg-decoder. */
const rgbIds = [0x52, 0x47, 0x42] as const;

const plural = (count: number, noun: string) => `${String(count)} ${noun}${count === 1 ? "" : "s"}`;

const refusal = (reason: string) =>
  `JPEG frame type 0xC3 (lossless) is refused: ${reason}; Chromium and resvg draw only 8-bit RGB-coded lossless ` +
  "JPEGs alike (components R G B, 1x1 sampling, no JFIF or restart interval, Adobe transform 0 if any, one scan " +
  "followed by the end-of-image marker)";

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;

const isRgb = (ids: readonly number[]) => ids.every((id, index) => id === rgbIds[index]);

/**
 * The lossless (SOF3) rule, fed by the JPEG walk. resvg-wasm 2.6.2 decodes with jpeg-decoder 0.3.1, whose lossless
 * path copies the stored samples as they are (no colour transform: it ignores JFIF, Adobe and the component ids), one
 * per component and pixel whatever the sampling factors, and draws nothing for a quantization table other than 0.
 * Chromium (libjpeg-turbo 3.1) converts no colour in lossless mode, so it draws only files it reads as RGB: none with
 * a JFIF APP0, none whose Adobe APP14 (the last before the first scan wins) has a transform other than 0. Both agree
 * exactly on an 8-bit frame of components R G B at 1x1 with no JFIF, no Adobe transform but 0 and one interleaved scan
 * of R G B on Huffman table 0, its image data ending at EOI; everything else is refused, restart intervals and point
 * transforms too (not probed). A file cut inside its image data, one without EOI and one with a second scan the two
 * draw differently (Chromium the rows or the scan it has, resvg nothing or the last scan). The difference symbols of
 * the image data are checked by `JpegEntropy.losslessFault`. Fixtures and the probe: test/assets/jpeg/sof3-* and
 * test/losslessJpegs.ts.
 */
export class LosslessJpeg {
  /** The first JFIF, Adobe or DRI segment that rules the file out, on either side of the frame header. */
  private segmentReason: string | undefined;
  private framed = false;

  /** True once a lossless frame header passed `readFrame`. */
  get lossless(): boolean {
    return this.framed;
  }

  /**
   * Records the segment of `marker` whose length field is at `offset`, for any frame type: an APP14 may precede the
   * frame header. JFIF is matched by its `JFIF` prefix and Adobe by its `Adobe` prefix, supersets of both decoders'.
   */
  readSegment(marker: number, bytes: Bytes, offset: number, length: number): void {
    this.segmentReason ??= segmentReason(marker, bytes, offset, length);
  }

  /** Why the SOF3 frame header at `offset` (its length field) is refused, or undefined when it qualifies. */
  readFrame(bytes: Bytes, offset: number, length: number): string | undefined {
    const reason = frameReason(bytes, offset, length);
    if (reason !== undefined) return refusal(reason);
    this.framed = true;
    return undefined;
  }

  /**
   * Why the file is refused at its first scan header (the SOS length field at `offset`), or undefined: the segments
   * before it, then the header.
   */
  problemAtScan(bytes: Bytes, offset: number): string | undefined {
    const reason = this.segmentReason ?? scanReason(bytes, offset);
    return reason === undefined ? undefined : refusal(reason);
  }

  /**
   * Why the file is refused by what ends its image data: `marker` as `skipEntropyData` found it without passing
   * restart markers (a DRI being refused, none can belong there), undefined when the data ran out. Only EOI qualifies.
   * The symbols up to it `JpegEntropy.losslessFault` has checked.
   */
  problemAfterImageData(marker: number | undefined): string | undefined {
    const reason = imageDataReason(marker);
    return reason === undefined ? undefined : refusal(reason);
  }

  /** The refusal of a lossless file cut before or inside its first scan header. */
  problemWhenTruncated(): string {
    return refusal("the file ends before its image data");
  }
}

function segmentReason(
  marker: number,
  bytes: Bytes,
  offset: number,
  length: number,
): string | undefined {
  const start = offset + 2;
  const size = length - 2;
  if (marker === 0xdd) return "a restart interval";
  if (marker === 0xe0 && size >= 4 && bytes.ascii(start, 4) === "JFIF") return "a JFIF segment";
  if (marker !== 0xee || size < 5 || bytes.ascii(start, 5) !== "Adobe") return undefined;
  // jpeg-decoder needs 12 bytes for an Adobe segment, libjpeg reads a shorter one as no Adobe segment at all.
  if (size < 12) return "a short Adobe segment";
  const transform = bytes.u8(start + 11);
  return transform === 0 ? undefined : `Adobe transform ${String(transform)}`;
}

function frameReason(bytes: Bytes, offset: number, length: number): string | undefined {
  const precision = bytes.u8(offset + 2);
  if (precision !== 8) return `precision of ${String(precision)} bits`;
  const count = bytes.u8(offset + 7);
  if (count !== rgbIds.length) return plural(count, "component");
  if (length !== 8 + 3 * count) return "an invalid frame header length";
  const components = rgbIds.map((_, index) => offset + 8 + 3 * index);
  const ids = components.map((at) => bytes.u8(at));
  if (!isRgb(ids)) return `component ids ${ids.join(" ")}`;
  for (const at of components) {
    const sampling = bytes.u8(at + 1);
    if (sampling !== 0x11) return `sampling ${String(sampling >> 4)}x${String(sampling & 0x0f)}`;
  }
  for (const at of components) {
    const table = bytes.u8(at + 2);
    if (table !== 0) return `quantization table ${String(table)}`;
  }
  return undefined;
}

function scanReason(bytes: Bytes, offset: number): string | undefined {
  const count = bytes.u8(offset + 2);
  if (count !== rgbIds.length) return `a scan of ${plural(count, "component")}`;
  if (bytes.u16be(offset) !== 6 + 2 * count) return "an invalid scan header length";
  const selectors = rgbIds.map((_, index) => bytes.u8(offset + 3 + 2 * index));
  if (!isRgb(selectors)) return `scan components ${selectors.join(" ")}`;
  // Only table 0 was probed; jpeg-decoder draws nothing for a selector above 3, which libjpeg-turbo may still read.
  for (let index = 0; index < count; index++) {
    const tables = bytes.u8(offset + 4 + 2 * index);
    if (tables !== 0) return `Huffman table selector ${hex(tables)}`;
  }
  const parameters = offset + 3 + 2 * count;
  const predictor = bytes.u8(parameters);
  if (predictor < 1 || predictor > 7) return `predictor ${String(predictor)}`;
  const end = bytes.u8(parameters + 1);
  if (end !== 0) return `a spectral selection end of ${String(end)}`;
  const approximation = bytes.u8(parameters + 2);
  if (approximation >> 4 !== 0) return `successive approximation ${String(approximation >> 4)}`;
  if ((approximation & 0x0f) !== 0) return `point transform ${String(approximation & 0x0f)}`;
  return undefined;
}

function imageDataReason(marker: number | undefined): string | undefined {
  if (marker === undefined) return "image data without an end-of-image marker";
  if (marker === 0) return "fill bytes before a stuffed zero in the image data";
  if (marker === 0xd9) return undefined;
  if (marker === 0xda) return "a second scan";
  if (marker >= 0xd0 && marker <= 0xd7) return `a restart marker ${hex(marker)}`;
  return `marker ${hex(marker)} after the image data`;
}
