import { exifOrientation, type Orientation, type OrientationField } from "./exifOrientation.js";

export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ImageInfo {
  readonly mime: ImageMime;
  readonly width: number;
  readonly height: number;
  /** 1 for a still image; counting stops one past `maxFrames`. */
  readonly frames: number;
  /**
   * Carries EXIF data (JPEG APP1 `Exif`, PNG `eXIf`, WebP `EXIF`): browsers apply its orientation to the pixels, so
   * the stored width and height may not be the drawn ones.
   */
  readonly exif: boolean;
  /**
   * EXIF orientation of the first EXIF block holding an Orientation entry, 1 without one; `width` and `height` are
   * the stored size, before it applies.
   */
  readonly orientation: Orientation;
  /** Every EXIF block with an Orientation entry, in file order: what `uprightImage` sets to 1. */
  readonly orientationFields: readonly OrientationField[];
}

export type SniffResult =
  | { readonly ok: true; readonly info: ImageInfo }
  | { readonly ok: false; readonly message: string };

class Truncated extends Error {}

class Bytes {
  constructor(readonly data: Uint8Array) {}

  u8(offset: number): number {
    const value = this.data[offset];
    if (value === undefined) throw new Truncated();
    return value;
  }

  u16be(offset: number): number {
    return (this.u8(offset) << 8) | this.u8(offset + 1);
  }

  u16le(offset: number): number {
    return this.u8(offset) | (this.u8(offset + 1) << 8);
  }

  u24le(offset: number): number {
    return this.u16le(offset) + this.u8(offset + 2) * 65_536;
  }

  u32be(offset: number): number {
    return this.u16be(offset) * 65_536 + this.u16be(offset + 2);
  }

  u32le(offset: number): number {
    return this.u16le(offset) + this.u16le(offset + 2) * 65_536;
  }

  ascii(offset: number, length: number): string {
    let text = "";
    for (let index = 0; index < length; index++)
      text += String.fromCharCode(this.u8(offset + index));
    return text;
  }

  startsWith(signature: readonly number[]): boolean {
    return signature.every((byte, index) => this.data[index] === byte);
  }
}

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Format by magic bytes (PNG, JPEG, GIF, WebP), dimensions from the header, the animation frame count and the EXIF
 * orientation, without decoding pixels. Every walk advances on each step and stops at the end of the bytes, so crafted input costs at
 * most one pass. SVG and anything else is refused.
 */
export function sniffImage(data: Uint8Array, maxFrames: number): SniffResult {
  const bytes = new Bytes(data);
  try {
    if (bytes.startsWith(png)) return sniffPng(bytes, maxFrames);
    if (bytes.startsWith([0xff, 0xd8, 0xff])) return sniffJpeg(bytes);
    if (bytes.startsWith([0x47, 0x49, 0x46, 0x38])) return sniffGif(bytes, maxFrames);
    if (bytes.startsWith([0x52, 0x49, 0x46, 0x46]) && bytes.ascii(8, 4) === "WEBP") {
      return sniffWebp(bytes, maxFrames);
    }
  } catch (error) {
    if (error instanceof Truncated) return { ok: false, message: "the image data is truncated" };
    throw error;
  }
  if (looksLikeMarkup(data)) {
    return { ok: false, message: "SVG images are refused, because they can carry scripts" };
  }
  return { ok: false, message: "not a PNG, JPEG, GIF or WebP image" };
}

function looksLikeMarkup(data: Uint8Array): boolean {
  for (const byte of data.subarray(0, 256)) {
    if (byte === 0x3c) return true;
    if (
      byte !== 0x20 &&
      byte !== 0x09 &&
      byte !== 0x0a &&
      byte !== 0x0d &&
      byte !== 0xef &&
      byte !== 0xbb &&
      byte !== 0xbf
    ) {
      return false;
    }
  }
  return false;
}

function found(
  mime: ImageMime,
  width: number,
  height: number,
  frames: number,
  exif: boolean,
  blocks: readonly OrientationField[] = [],
): SniffResult {
  if (width === 0 || height === 0) return { ok: false, message: "the image declares a zero size" };
  const orientationFields = blocks.filter((block) => block.entries.length > 0);
  const orientation = orientationFields[0]?.orientation ?? 1;
  return { ok: true, info: { mime, width, height, frames, exif, orientation, orientationFields } };
}

function sniffPng(bytes: Bytes, maxFrames: number): SniffResult {
  if (bytes.ascii(12, 4) !== "IHDR") return { ok: false, message: "PNG does not start with IHDR" };
  const width = bytes.u32be(16);
  const height = bytes.u32be(20);
  let frames = 1;
  let exif = false;
  const blocks: OrientationField[] = [];
  let offset = 8;
  for (;;) {
    const length = bytes.u32be(offset);
    const type = bytes.ascii(offset + 4, 4);
    if (type === "acTL") frames = Math.min(bytes.u32be(offset + 8), maxFrames + 1);
    if (type === "eXIf") {
      exif = true;
      pngExifBlock(bytes, offset, length, blocks);
    }
    if (type === "IDAT" || type === "IEND") break;
    offset += 12 + length;
  }
  if (pngExifAfter(bytes, offset, blocks)) exif = true;
  return found("image/png", width, height, frames, exif, blocks);
}

/**
 * `eXIf` chunks after the image data, their blocks collected into `blocks`: some decoders read them there too. A
 * cut-off walk just ends.
 */
function pngExifAfter(bytes: Bytes, start: number, blocks: OrientationField[]): boolean {
  let exif = false;
  let offset = start;
  while (offset + 8 <= bytes.data.length) {
    const length = bytes.u32be(offset);
    const type = bytes.ascii(offset + 4, 4);
    if (type === "IEND") break;
    if (type === "eXIf") {
      exif = true;
      pngExifBlock(bytes, offset, length, blocks);
    }
    offset += 12 + length;
  }
  return exif;
}

/** The EXIF block of the `eXIf` chunk at `offset`, when the whole chunk, CRC included, lies inside the data. */
function pngExifBlock(
  bytes: Bytes,
  offset: number,
  length: number,
  blocks: OrientationField[],
): void {
  const end = offset + 8 + length;
  if (end + 4 > bytes.data.length) return;
  blocks.push({
    ...exifOrientation(bytes.data, offset + 8, end),
    checksum: { start: offset + 4, end },
  });
}

/**
 * SOF0-SOF2: the frame types (baseline, extended and progressive Huffman, 8-bit) every output draws alike. The others
 * are refused after the RM-51 probe (Chromium 156, resvg-wasm 2.6.2; fixtures in test/assets/jpeg): resvg draws
 * arithmetic coding (SOF9-11) empty, and lossless (SOF3) differently from Chromium (grey black there, YCbCr other
 * colours; only RGB-coded files match).
 */
function isFrameHeader(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xc2;
}

/** The segments every output reads (or skips) by their length: DHT, DQT, DRI, APPn, COM. */
function isLengthSegment(marker: number): boolean {
  return (
    marker === 0xc4 ||
    marker === 0xdb ||
    marker === 0xdd ||
    (marker >= 0xe0 && marker <= 0xef) ||
    marker === 0xfe
  );
}

const hex = (value: number) => `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;

/**
 * Why a JPEG holding `marker` before its image data is refused, or undefined when the walk reads it on. Chromium
 * (libjpeg) draws nothing for the markers it rejects there, and resvg (jpeg-decoder) draws nothing for RSTn, TEM, DNL
 * and DAC: refusing them names the marker instead of an empty box in one output or both. SOS is the caller's.
 */
function jpegMarkerProblem(marker: number, sawFrame: boolean): string | undefined {
  if (marker === 0xd8) return "JPEG holds a second start-of-image marker";
  if (marker === 0xd9) return "JPEG ends before its image data";
  if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xcc || marker === 0xdc) {
    return `JPEG holds marker ${hex(marker)} before its image data`;
  }
  if (isFrameHeader(marker)) return sawFrame ? "JPEG holds a second frame header" : undefined;
  if (marker === 0xc3 || (marker >= 0xc9 && marker <= 0xcb)) {
    return marker === 0xc3
      ? `JPEG frame type ${hex(marker)} (lossless) is refused, because Chromium and resvg draw it differently`
      : `JPEG frame type ${hex(marker)} (arithmetic coded) is refused, because resvg draws it empty`;
  }
  if ((marker >= 0xc5 && marker <= 0xc8) || (marker >= 0xcd && marker <= 0xcf)) {
    return `JPEG frame type ${hex(marker)} is not supported`;
  }
  if (isLengthSegment(marker)) return undefined;
  return `JPEG holds an unknown marker ${hex(marker)}`;
}

/**
 * Why the frame header segment at `offset` (its length field) is refused: libjpeg's checks, 8-bit samples only.
 * resvg-wasm 2.6.2 draws a DCT frame of 12 bits empty (RM-51 fixtures sof1-12bit-*).
 */
function frameHeaderProblem(bytes: Bytes, offset: number, length: number): string | undefined {
  const precision = bytes.u8(offset + 2);
  if (precision !== 8) {
    return `JPEG sample precision of ${String(precision)} bits is refused, because resvg draws it empty; only 8 bits are supported`;
  }
  const components = bytes.u8(offset + 7);
  if (components === 0 || length !== 8 + 3 * components) {
    return "JPEG frame header length is invalid";
  }
  return undefined;
}

/**
 * Walks the segments up to the image data: the size from the frame header, EXIF from any APP1 `Exif` segment before
 * the scan (decoders read every marker up to it). Before the frame header the segments must follow each other
 * exactly; past it the walk reads markers as libjpeg (and so Chromium) does, so it finds the same EXIF segments, and a
 * cut-off walk just ends. A marker libjpeg rejects or resvg draws empty, before or after the frame header, refuses the image. Every step
 * advances, so the walk is one pass at most.
 */
function sniffJpeg(bytes: Bytes): SniffResult {
  let offset = 2;
  let size: readonly [width: number, height: number] | undefined;
  let exif = false;
  const blocks: OrientationField[] = [];
  try {
    for (;;) {
      const next = nextMarker(bytes, offset, size !== undefined);
      if (next === undefined)
        return { ok: false, message: "JPEG segment does not start with 0xFF" };
      const marker = next.marker;
      offset = next.offset;
      if (marker === 0xda) {
        if (size === undefined) {
          return { ok: false, message: "JPEG has no frame header before its image data" };
        }
        return found("image/jpeg", size[0], size[1], 1, exif, blocks);
      }
      const problem = jpegMarkerProblem(marker, size !== undefined);
      if (problem !== undefined) return { ok: false, message: problem };
      const length = bytes.u16be(offset);
      if (length < 2) {
        return { ok: false, message: `JPEG segment ${hex(marker)} length is invalid` };
      }
      // Decoders check only `Exif\0`; the sixth byte, meant to be 0, may be anything.
      if (marker === 0xe1 && length >= 8 && bytes.ascii(offset + 2, 5) === "Exif\0") {
        exif = true;
        blocks.push(exifOrientation(bytes.data, offset + 8, offset + length));
      }
      if (isFrameHeader(marker)) {
        const frameProblem = frameHeaderProblem(bytes, offset, length);
        if (frameProblem !== undefined) return { ok: false, message: frameProblem };
        size = [bytes.u16be(offset + 5), bytes.u16be(offset + 3)];
      }
      offset += length;
    }
  } catch (error) {
    if (!(error instanceof Truncated) || size === undefined) throw error;
    return found("image/jpeg", size[0], size[1], 1, exif, blocks);
  }
}

/**
 * The marker code at or after `start` and the offset just past it, or undefined when the bytes there are no marker.
 * Strict, a marker must start right at `start` (0xFF fill bytes allowed). Lenient is libjpeg's next_marker: bytes
 * up to a 0xFF are skipped, then fill bytes, and `FF 00` (a stuffed zero, no marker) sends the scan on.
 */
function nextMarker(
  bytes: Bytes,
  start: number,
  lenient: boolean,
): { readonly marker: number; readonly offset: number } | undefined {
  let offset = start;
  for (;;) {
    if (bytes.u8(offset) !== 0xff) {
      if (!lenient) return undefined;
      while (bytes.u8(offset) !== 0xff) offset++;
    }
    while (bytes.u8(offset) === 0xff) offset++;
    const marker = bytes.u8(offset);
    offset++;
    if (marker !== 0) return { marker, offset };
    if (!lenient) return undefined;
  }
}

function skipSubBlocks(bytes: Bytes, start: number): number {
  let offset = start;
  for (;;) {
    const size = bytes.u8(offset);
    offset += 1 + size;
    if (size === 0) return offset;
  }
}

function colourTableSize(flags: number): number {
  return (flags & 0x80) === 0 ? 0 : 3 * (1 << ((flags & 0x07) + 1));
}

function sniffGif(bytes: Bytes, maxFrames: number): SniffResult {
  const version = bytes.ascii(0, 6);
  if (version !== "GIF87a" && version !== "GIF89a")
    return { ok: false, message: "unknown GIF version" };
  const width = bytes.u16le(6);
  const height = bytes.u16le(8);
  let offset = 13 + colourTableSize(bytes.u8(10));
  let frames = 0;
  try {
    while (frames <= maxFrames) {
      const block = bytes.u8(offset);
      if (block === 0x3b) break;
      if (block === 0x2c) {
        frames++;
        offset = skipSubBlocks(bytes, offset + 10 + colourTableSize(bytes.u8(offset + 9)) + 1);
      } else if (block === 0x21) {
        offset = skipSubBlocks(bytes, offset + 2);
      } else {
        return { ok: false, message: "GIF holds an unknown block" };
      }
    }
  } catch (error) {
    // Many encoders omit the trailer; a GIF cut after a complete frame still has its frames counted.
    if (!(error instanceof Truncated) || frames === 0) throw error;
  }
  if (frames === 0) return { ok: false, message: "GIF holds no image" };
  return found("image/gif", width, height, frames, false);
}

function sniffWebp(bytes: Bytes, maxFrames: number): SniffResult {
  const first = bytes.ascii(12, 4);
  if (first === "VP8 ") {
    if (bytes.u8(23) !== 0x9d || bytes.u8(24) !== 0x01 || bytes.u8(25) !== 0x2a) {
      return { ok: false, message: "WebP VP8 start code is missing" };
    }
    return found("image/webp", bytes.u16le(26) & 0x3fff, bytes.u16le(28) & 0x3fff, 1, false);
  }
  if (first === "VP8L") {
    if (bytes.u8(20) !== 0x2f) return { ok: false, message: "WebP VP8L signature is missing" };
    const bits = bytes.u32le(21);
    return found("image/webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 1, false);
  }
  if (first !== "VP8X") return { ok: false, message: "unknown WebP chunk" };
  const width = bytes.u24le(24) + 1;
  const height = bytes.u24le(27) + 1;
  const flags = bytes.u8(20);
  // The EXIF flag of VP8X, or an EXIF chunk even where the flag is missing.
  let exif = (flags & 0x08) !== 0;
  const blocks: OrientationField[] = [];
  let frames = 0;
  let offset = 12;
  while (offset + 8 <= bytes.data.length && frames <= maxFrames) {
    const type = bytes.ascii(offset, 4);
    const size = bytes.u32le(offset + 4);
    if (type === "ANMF") frames++;
    if (type === "EXIF") {
      exif = true;
      blocks.push(exifOrientation(bytes.data, offset + 8, offset + 8 + size));
    }
    offset += 8 + size + (size % 2);
  }
  if ((flags & 0x02) === 0) return found("image/webp", width, height, 1, exif, blocks);
  if (frames === 0) return { ok: false, message: "animated WebP holds no frame" };
  return found("image/webp", width, height, frames, exif, blocks);
}
