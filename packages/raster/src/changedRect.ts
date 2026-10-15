import type { PixelRect } from "./PixelRect.js";

/** The smallest rectangle holding every pixel that differs between two RGBA frames; `undefined` when none does. */
export function changedRect(
  previous: Uint8Array,
  current: Uint8Array,
  width: number,
  height: number,
): PixelRect | undefined {
  const before = words(previous);
  const after = words(current);
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (before[row + x] === after[row + x]) continue;
      if (y < top) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return undefined;
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Whether two RGBA frames hold the same pixels. */
export function samePixels(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  const left = words(a);
  const right = words(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Crops an RGBA image of row length `stride` to `rect`. */
export function cropRgba(pixels: Uint8Array, stride: number, rect: PixelRect): Uint8Array {
  if (
    rect.x === 0 &&
    rect.y === 0 &&
    rect.width === stride &&
    pixels.length === stride * rect.height * 4
  ) {
    return pixels;
  }
  const out = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * stride + rect.x) * 4;
    out.set(pixels.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  return out;
}

// One comparison per pixel; a copy only when the view would be unaligned.
function words(pixels: Uint8Array): Uint32Array {
  const aligned = pixels.byteOffset % 4 === 0 ? pixels : pixels.slice();
  return new Uint32Array(aligned.buffer, aligned.byteOffset, aligned.length / 4);
}
