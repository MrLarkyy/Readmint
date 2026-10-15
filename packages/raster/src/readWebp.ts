import { RasterError } from "./RasterError.js";

/** One RIFF chunk: its FourCC and its payload, without the padding byte. */
export interface WebpChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

/** One `ANMF` frame of an animated WebP: where it goes on the canvas and its image chunks. */
export interface WebpFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Milliseconds. */
  readonly duration: number;
  /** Alpha-blend over the canvas; otherwise the frame's pixels replace it. */
  readonly blend: boolean;
  /** Clear the frame's rectangle to transparent before the next frame. */
  readonly dispose: boolean;
  /** `ALPH` (optional) and `VP8 `, or `VP8L`. */
  readonly chunks: readonly WebpChunk[];
}

export type WebpImage =
  | { readonly kind: "still"; readonly width: number; readonly height: number }
  | {
      readonly kind: "animated";
      readonly width: number;
      readonly height: number;
      /** 0: forever. */
      readonly loopCount: number;
      readonly frames: readonly WebpFrame[];
    };

export interface WebpReadLimits {
  readonly maxSide: number;
  readonly maxFrames: number;
}

const animationFlag = 0x02;

/**
 * Reads the structure of a WebP file without decoding pixels. Every offset is checked against the bytes before it is
 * read and every step advances, so a crafted file costs one pass; anything malformed is a `raster-image` error.
 */
export function readWebp(bytes: Uint8Array, limits: WebpReadLimits): WebpImage {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw malformed("it is not a RIFF WEBP file");
  }
  const end = 8 + u32le(bytes, 4);
  if (end > bytes.length) throw malformed("the RIFF size is larger than the file");
  const chunks = readChunks(bytes, 12, end);
  const first = chunks[0];
  if (first === undefined) throw malformed("it holds no chunk");
  if (first.type === "VP8 " || first.type === "VP8L") {
    const { width, height } = bitstreamSize(first);
    return checkSize({ kind: "still", width, height }, limits);
  }
  if (first.type !== "VP8X" || first.data.length < 10)
    throw malformed("the first chunk is unknown");
  const width = u24le(first.data, 4) + 1;
  const height = u24le(first.data, 7) + 1;
  checkSize({ kind: "still", width, height }, limits);
  if ((byteAt(first.data, 0) & animationFlag) === 0) {
    const image = chunks.find((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L");
    if (image === undefined) throw malformed("it holds no image data");
    const size = bitstreamSize(image);
    if (size.width !== width || size.height !== height) {
      throw malformed("the image data and the canvas differ in size");
    }
    return { kind: "still", width, height };
  }
  const anim = chunks.find((chunk) => chunk.type === "ANIM");
  if (anim === undefined || anim.data.length < 6) throw malformed("it has no ANIM chunk");
  const frames: WebpFrame[] = [];
  for (const chunk of chunks) {
    if (chunk.type !== "ANMF") continue;
    if (frames.length === limits.maxFrames) {
      throw malformed(`it has more than ${String(limits.maxFrames)} frames`);
    }
    frames.push(readFrame(chunk.data, width, height));
  }
  if (frames.length === 0) throw malformed("it is animated but has no frame");
  return { kind: "animated", width, height, loopCount: u16le(anim.data, 4), frames };
}

/** The chunks of a still WebP file as its encoder wrote them. */
export function webpChunks(bytes: Uint8Array): WebpChunk[] {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw malformed("it is not a RIFF WEBP file");
  }
  return readChunks(bytes, 12, Math.min(bytes.length, 8 + u32le(bytes, 4)));
}

function readFrame(data: Uint8Array, canvasWidth: number, canvasHeight: number): WebpFrame {
  if (data.length < 16) throw malformed("an ANMF chunk is truncated");
  const x = u24le(data, 0) * 2;
  const y = u24le(data, 3) * 2;
  const width = u24le(data, 6) + 1;
  const height = u24le(data, 9) + 1;
  if (x + width > canvasWidth || y + height > canvasHeight) {
    throw malformed("a frame lies outside the canvas");
  }
  const flags = byteAt(data, 15);
  const chunks = readChunks(data, 16, data.length);
  const image = chunks.find((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L");
  if (image === undefined) throw malformed("a frame holds no image data");
  const size = bitstreamSize(image);
  if (size.width !== width || size.height !== height) {
    throw malformed("a frame's image data and its header differ in size");
  }
  return {
    x,
    y,
    width,
    height,
    duration: u24le(data, 12),
    blend: (flags & 0x02) === 0,
    dispose: (flags & 0x01) !== 0,
    chunks,
  };
}

function readChunks(bytes: Uint8Array, start: number, end: number): WebpChunk[] {
  const chunks: WebpChunk[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw malformed("a chunk header is truncated");
    const size = u32le(bytes, offset + 4);
    const dataEnd = offset + 8 + size;
    if (dataEnd > end) throw malformed("a chunk runs past the end of the file");
    chunks.push({ type: ascii(bytes, offset, 4), data: bytes.subarray(offset + 8, dataEnd) });
    offset = dataEnd + (size & 1);
  }
  return chunks;
}

function bitstreamSize(chunk: WebpChunk): { width: number; height: number } {
  const data = chunk.data;
  if (chunk.type === "VP8L") {
    if (data.length < 5 || data[0] !== 0x2f) throw malformed("a VP8L header is invalid");
    const bits = u32le(data, 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) {
    throw malformed("a VP8 header is invalid");
  }
  return { width: u16le(data, 6) & 0x3fff, height: u16le(data, 8) & 0x3fff };
}

function checkSize<T extends { width: number; height: number }>(
  image: T,
  limits: WebpReadLimits,
): T {
  if (image.width === 0 || image.height === 0) throw malformed("it declares a zero size");
  if (image.width > limits.maxSide || image.height > limits.maxSide) {
    throw malformed(
      `it is ${String(image.width)}x${String(image.height)} pixels; each side may be at most ${String(limits.maxSide)}`,
    );
  }
  return image;
}

function malformed(reason: string): RasterError {
  return new RasterError("raster-image", `a WebP image cannot be drawn: ${reason}`);
}

function byteAt(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset];
  if (value === undefined) throw malformed("it is truncated");
  return value;
}

function u16le(bytes: Uint8Array, offset: number): number {
  return byteAt(bytes, offset) | (byteAt(bytes, offset + 1) << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return u16le(bytes, offset) + byteAt(bytes, offset + 2) * 65_536;
}

function u32le(bytes: Uint8Array, offset: number): number {
  return u16le(bytes, offset) + u16le(bytes, offset + 2) * 65_536;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index++) {
    text += String.fromCharCode(byteAt(bytes, offset + index));
  }
  return text;
}
