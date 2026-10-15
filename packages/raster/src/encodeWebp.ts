import { changedRect, cropRgba } from "./changedRect.js";
import type { FrameEncoder } from "./FrameEncoder.js";
import type { OutputBudget } from "./OutputBudget.js";
import type { PixelRect } from "./PixelRect.js";
import { type WebpChunk, webpChunks } from "./readWebp.js";
import type { WebpCodec } from "./WebpCodec.js";
import { riffWebp, serializeChunks, writeU24le } from "./writeWebp.js";

const animationFlag = 0x02;
const alphaFlag = 0x10;
// ANMF flags: bit 1 set = do not blend (the frame replaces its rectangle), bit 0 clear = no disposal.
const replaceFlags = 0x02;

/** A still WebP, lossless or lossy at `quality`. */
export function encodeWebpStill(
  pixels: Uint8Array,
  width: number,
  height: number,
  codecs: WebpCodec,
  budget: OutputBudget,
  quality?: number,
): Uint8Array {
  const bytes = codecs.encodeWebp({ data: pixels, width, height }, quality);
  budget.add(bytes.length);
  return bytes;
}

/**
 * An animated WebP of lossless frames (lossy at `quality` when given), delays in milliseconds: libwebp encodes each frame's changed rectangle (its
 * corner moved to even coordinates, as ANMF stores them halved) and this writes the VP8X, ANIM and ANMF container
 * around them. Frames replace their rectangle and are not disposed, so the canvas always equals the full frame.
 */
export function encodeWebp(
  width: number,
  height: number,
  loop: boolean,
  codecs: WebpCodec,
  budget: OutputBudget,
  quality?: number,
): FrameEncoder {
  const frames: WebpChunk[] = [];
  let previous: Uint8Array | undefined;
  let alpha = false;
  // RIFF header, VP8X and ANIM chunks.
  budget.add(12 + 18 + 14);
  return {
    get frames() {
      return frames.length;
    },
    add(pixels, delay) {
      alpha ||= hasAlpha(pixels);
      const changed =
        previous === undefined
          ? { x: 0, y: 0, width, height }
          : (changedRect(previous, pixels, width, height) ?? { x: 0, y: 0, width: 1, height: 1 });
      const rect = evenCorner(changed);
      const encoded = codecs.encodeWebp(
        { data: cropRgba(pixels, width, rect), width: rect.width, height: rect.height },
        quality,
      );
      const image = serializeChunks(
        webpChunks(encoded).filter((chunk) => ["ALPH", "VP8 ", "VP8L"].includes(chunk.type)),
      );
      const data = new Uint8Array(16 + image.length);
      writeU24le(data, 0, rect.x / 2);
      writeU24le(data, 3, rect.y / 2);
      writeU24le(data, 6, rect.width - 1);
      writeU24le(data, 9, rect.height - 1);
      writeU24le(data, 12, delay);
      data[15] = replaceFlags;
      data.set(image, 16);
      budget.add(8 + data.length + (data.length & 1));
      frames.push({ type: "ANMF", data });
      previous = pixels;
    },
    finish() {
      const header = new Uint8Array(10);
      header[0] = animationFlag | (alpha ? alphaFlag : 0);
      writeU24le(header, 4, width - 1);
      writeU24le(header, 7, height - 1);
      // Background colour (unused: frames replace their rectangle) and the loop count, 0 = forever.
      const anim = new Uint8Array(6);
      anim[4] = loop ? 0 : 1;
      return riffWebp([{ type: "VP8X", data: header }, { type: "ANIM", data: anim }, ...frames]);
    },
  };
}

function evenCorner(rect: PixelRect): PixelRect {
  const x = rect.x - (rect.x % 2);
  const y = rect.y - (rect.y % 2);
  return { x, y, width: rect.width + rect.x - x, height: rect.height + rect.y - y };
}

function hasAlpha(pixels: Uint8Array): boolean {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 255) return true;
  }
  return false;
}
