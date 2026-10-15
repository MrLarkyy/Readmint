import { crc32 } from "node:zlib";
import { GifReader } from "omggif";
import { PNG } from "pngjs";
import { openWebpCodec } from "../src/initRaster.js";
import { readWebp } from "../src/readWebp.js";
import { stillWebp } from "../src/writeWebp.js";

/** One frame as a viewer shows it: the whole canvas after the frame was drawn. */
export interface DecodedFrame {
  /** In the file's unit: ms for APNG and WebP, centiseconds for GIF. */
  readonly delay: number;
  readonly pixels: Uint8Array;
}

export interface DecodedRaster {
  readonly width: number;
  readonly height: number;
  /** APNG num_plays, WebP loop count, GIF NETSCAPE count; `null` for a GIF without one (plays once). */
  readonly loop: number | null;
  readonly frames: readonly DecodedFrame[];
}

/** Splits an APNG into its frames with an own chunk reader, decodes each with pngjs and composes the canvas. */
export function decodeApng(bytes: Uint8Array): DecodedRaster {
  const chunks = pngChunks(bytes);
  const header = chunk(chunks, "IHDR");
  const view = new DataView(header.buffer, header.byteOffset, header.length);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  const control = chunks.find((entry) => entry.type === "acTL");
  if (control === undefined) {
    return { width, height, loop: null, frames: [{ delay: 0, pixels: decodePng(bytes) }] };
  }
  const loop = new DataView(control.data.buffer, control.data.byteOffset).getUint32(4);
  const canvas = new Uint8Array(width * height * 4);
  const frames: DecodedFrame[] = [];
  let current:
    { x: number; y: number; w: number; h: number; delay: number; data: Uint8Array[] } | undefined;
  const flush = (): void => {
    if (current === undefined) return;
    const png = pngFile(current.w, current.h, current.data);
    const pixels = decodePng(png);
    for (let row = 0; row < current.h; row++) {
      canvas.set(
        pixels.subarray(row * current.w * 4, (row + 1) * current.w * 4),
        ((current.y + row) * width + current.x) * 4,
      );
    }
    frames.push({ delay: current.delay, pixels: canvas.slice() });
  };
  for (const entry of chunks) {
    if (entry.type === "fcTL") {
      flush();
      const fc = new DataView(entry.data.buffer, entry.data.byteOffset, entry.data.length);
      if (fc.getUint8(24) !== 0 || fc.getUint8(25) !== 0)
        throw new Error("unexpected dispose/blend");
      const denominator = fc.getUint16(22);
      current = {
        w: fc.getUint32(4),
        h: fc.getUint32(8),
        x: fc.getUint32(12),
        y: fc.getUint32(16),
        delay: (fc.getUint16(20) * 1000) / denominator,
        data: [],
      };
    } else if (entry.type === "IDAT" && current !== undefined) {
      current.data.push(entry.data);
    } else if (entry.type === "fdAT" && current !== undefined) {
      current.data.push(entry.data.subarray(4));
    }
  }
  flush();
  return { width, height, loop, frames };
}

/** Reads an (animated) WebP with the package's ANMF reader and libwebp, composing frames as a viewer does. */
export async function decodeWebp(bytes: Uint8Array): Promise<DecodedRaster> {
  const codecs = await openWebpCodec();
  const image = readWebp(bytes, { maxSide: 16_384, maxFrames: 10_000 });
  if (image.kind === "still") {
    const decoded = codecs.decodeWebp(bytes);
    if (decoded === undefined) throw new Error("libwebp cannot decode the still image");
    return {
      width: image.width,
      height: image.height,
      loop: 0,
      frames: [{ delay: 0, pixels: decoded.data }],
    };
  }
  const canvas = new Uint8Array(image.width * image.height * 4);
  const frames: DecodedFrame[] = [];
  for (const frame of image.frames) {
    if (frame.blend || frame.dispose) throw new Error("unexpected blend/dispose");
    const decoded = codecs.decodeWebp(stillWebp(frame));
    if (decoded === undefined) throw new Error("libwebp cannot decode a frame");
    for (let row = 0; row < frame.height; row++) {
      canvas.set(
        decoded.data.subarray(row * frame.width * 4, (row + 1) * frame.width * 4),
        ((frame.y + row) * image.width + frame.x) * 4,
      );
    }
    frames.push({ delay: frame.duration, pixels: canvas.slice() });
  }
  return { width: image.width, height: image.height, loop: image.loopCount, frames };
}

/** Decodes a GIF with omggif, honouring each frame's disposal. */
export function decodeGif(bytes: Uint8Array): DecodedRaster {
  const reader = new GifReader(Buffer.from(bytes));
  const canvas = new Uint8Array(reader.width * reader.height * 4);
  const frames: DecodedFrame[] = [];
  let dispose: { x: number; y: number; width: number; height: number } | undefined;
  for (let index = 0; index < reader.numFrames(); index++) {
    if (dispose !== undefined) {
      for (let row = dispose.y; row < dispose.y + dispose.height; row++) {
        canvas.fill(
          0,
          (row * reader.width + dispose.x) * 4,
          (row * reader.width + dispose.x + dispose.width) * 4,
        );
      }
    }
    const info = reader.frameInfo(index);
    reader.decodeAndBlitFrameRGBA(index, canvas);
    frames.push({ delay: info.delay, pixels: canvas.slice() });
    dispose = info.disposal === 2 ? info : undefined;
  }
  return { width: reader.width, height: reader.height, loop: reader.loopCount(), frames };
}

/** Straight RGBA of a PNG. */
export function decodePng(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(PNG.sync.read(Buffer.from(bytes)).data);
}

/** A PNG of straight RGBA pixels, written by pngjs (independent of the package's writer). */
export function pngOf(pixels: Uint8Array, width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixels);
  return PNG.sync.write(png);
}

/** The frames of one export stacked top to bottom into one image. */
export function frameSheet(raster: DecodedRaster): Buffer {
  const frameBytes = raster.width * raster.height * 4;
  const sheet = new Uint8Array(frameBytes * raster.frames.length);
  raster.frames.forEach((frame, index) => {
    sheet.set(frame.pixels, index * frameBytes);
  });
  return pngOf(sheet, raster.width, raster.height * raster.frames.length);
}

interface PngChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

function pngChunks(bytes: Uint8Array): PngChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)
    ) {
      throw new Error(`bad CRC in ${type}`);
    }
    chunks.push({ type, data });
    offset += 12 + length;
  }
  return chunks;
}

function chunk(chunks: readonly PngChunk[], type: string): Uint8Array {
  const found = chunks.find((entry) => entry.type === type);
  if (found === undefined) throw new Error(`no ${type} chunk`);
  return found.data;
}

function pngFile(width: number, height: number, data: readonly Uint8Array[]): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunk("IHDR", header),
    ...data.map((part) => pngChunk("IDAT", part)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  return Buffer.concat(parts);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Buffer.from(type, "latin1"), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
