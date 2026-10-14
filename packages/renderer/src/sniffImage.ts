export type ImageMime = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface ImageInfo {
  readonly mime: ImageMime;
  readonly width: number;
  readonly height: number;
  /** 1 for a still image; counting stops one past `maxFrames`. */
  readonly frames: number;
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
 * Format by magic bytes (PNG, JPEG, GIF, WebP), dimensions from the header and the animation frame count, without
 * decoding pixels. Every walk advances on each step and stops at the end of the bytes, so crafted input costs at
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

function found(mime: ImageMime, width: number, height: number, frames = 1): SniffResult {
  if (width === 0 || height === 0) return { ok: false, message: "the image declares a zero size" };
  return { ok: true, info: { mime, width, height, frames } };
}

function sniffPng(bytes: Bytes, maxFrames: number): SniffResult {
  if (bytes.ascii(12, 4) !== "IHDR") return { ok: false, message: "PNG does not start with IHDR" };
  const width = bytes.u32be(16);
  const height = bytes.u32be(20);
  let frames = 1;
  let offset = 8;
  for (;;) {
    const length = bytes.u32be(offset);
    const type = bytes.ascii(offset + 4, 4);
    if (type === "acTL") frames = Math.min(bytes.u32be(offset + 8), maxFrames + 1);
    if (type === "IDAT" || type === "IEND") break;
    offset += 12 + length;
  }
  return found("image/png", width, height, frames);
}

function isFrameHeader(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function sniffJpeg(bytes: Bytes): SniffResult {
  let offset = 2;
  for (;;) {
    if (bytes.u8(offset) !== 0xff)
      return { ok: false, message: "JPEG segment does not start with 0xFF" };
    while (bytes.u8(offset) === 0xff) offset++;
    const marker = bytes.u8(offset);
    offset++;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xd9 || marker === 0xda) {
      return { ok: false, message: "JPEG has no frame header before its image data" };
    }
    const length = bytes.u16be(offset);
    if (length < 2) return { ok: false, message: "JPEG segment length is invalid" };
    if (isFrameHeader(marker)) {
      return found("image/jpeg", bytes.u16be(offset + 5), bytes.u16be(offset + 3));
    }
    offset += length;
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
  return found("image/gif", width, height, frames);
}

function sniffWebp(bytes: Bytes, maxFrames: number): SniffResult {
  const first = bytes.ascii(12, 4);
  if (first === "VP8 ") {
    if (bytes.u8(23) !== 0x9d || bytes.u8(24) !== 0x01 || bytes.u8(25) !== 0x2a) {
      return { ok: false, message: "WebP VP8 start code is missing" };
    }
    return found("image/webp", bytes.u16le(26) & 0x3fff, bytes.u16le(28) & 0x3fff);
  }
  if (first === "VP8L") {
    if (bytes.u8(20) !== 0x2f) return { ok: false, message: "WebP VP8L signature is missing" };
    const bits = bytes.u32le(21);
    return found("image/webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (first !== "VP8X") return { ok: false, message: "unknown WebP chunk" };
  const width = bytes.u24le(24) + 1;
  const height = bytes.u24le(27) + 1;
  if ((bytes.u8(20) & 0x02) === 0) return found("image/webp", width, height);
  let frames = 0;
  let offset = 12;
  while (offset + 8 <= bytes.data.length && frames <= maxFrames) {
    if (bytes.ascii(offset, 4) === "ANMF") frames++;
    const size = bytes.u32le(offset + 4);
    offset += 8 + size + (size % 2);
  }
  if (frames === 0) return { ok: false, message: "animated WebP holds no frame" };
  return found("image/webp", width, height, frames);
}
