import type { WebpChunk, WebpFrame } from "./readWebp.js";
import { RasterError } from "./RasterError.js";

/** A still WebP file of one frame's image chunks, for the decoder. */
export function stillWebp(frame: WebpFrame): Uint8Array {
  const alpha = frame.chunks.find((chunk) => chunk.type === "ALPH");
  const image = frame.chunks.find((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L");
  if (image === undefined) {
    throw new RasterError(
      "raster-image",
      "a WebP image cannot be drawn: a frame holds no image data",
    );
  }
  if (alpha === undefined || image.type === "VP8L") return riffWebp([image]);
  const header = new Uint8Array(10);
  header[0] = 0x10;
  writeU24le(header, 4, frame.width - 1);
  writeU24le(header, 7, frame.height - 1);
  return riffWebp([{ type: "VP8X", data: header }, alpha, image]);
}

/** A `RIFF` `WEBP` file of the chunks. */
export function riffWebp(chunks: readonly WebpChunk[]): Uint8Array {
  const body = serializeChunks(chunks);
  const out = new Uint8Array(12 + body.length);
  out.set(asciiBytes("RIFF"), 0);
  writeU32le(out, 4, 4 + body.length);
  out.set(asciiBytes("WEBP"), 8);
  out.set(body, 12);
  return out;
}

/** The chunks one after another, each with its header and padded to an even length. */
export function serializeChunks(chunks: readonly WebpChunk[]): Uint8Array {
  const size = chunks.reduce(
    (total, chunk) => total + 8 + chunk.data.length + (chunk.data.length & 1),
    0,
  );
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(asciiBytes(chunk.type), offset);
    writeU32le(out, offset + 4, chunk.data.length);
    out.set(chunk.data, offset + 8);
    offset += 8 + chunk.data.length + (chunk.data.length & 1);
  }
  return out;
}

function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

export function writeU24le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

export function writeU32le(bytes: Uint8Array, offset: number, value: number): void {
  writeU24le(bytes, offset, value);
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
