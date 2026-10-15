import { zlibSync } from "fflate";
import { crc32 } from "@readmint/renderer";
import type { OutputBudget } from "./OutputBudget.js";

const signature = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/** Writes PNG chunks (length, type, data, CRC) into one file, counting each against the budget. */
export class PngWriter {
  private readonly parts: Uint8Array[] = [signature];

  constructor(private readonly budget: OutputBudget) {
    budget.add(signature.length);
  }

  chunk(type: string, data: Uint8Array): void {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    this.budget.add(out.length);
    this.parts.push(out);
  }

  /** Parts written so far (the signature and each chunk): a position for `insertChunk`. */
  get position(): number {
    return this.parts.length;
  }

  /** Writes a chunk at an earlier `position`: for acTL, whose frame count is known only at the end. */
  insertChunk(at: number, type: string, data: Uint8Array): void {
    const tail = this.parts.splice(at);
    this.chunk(type, data);
    this.parts.push(...tail);
  }

  bytes(): Uint8Array {
    const total = this.parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

/** The IHDR of an 8-bit RGBA image. */
export function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8;
  data[9] = 6;
  return data;
}

/**
 * The zlib stream (fflate: plain JavaScript, so the same bytes on every machine) of an RGBA rectangle of `image`
 * (row stride `stride` pixels), at `level` 9 for output, 1 for a PNG only resvg reads. Each row takes the filter whose
 * output has the smallest sum of absolute values, the heuristic libpng uses: a fixed rule, so equal pixels give
 * equal bytes.
 */
export function compressRgba(
  image: Uint8Array,
  stride: number,
  rect: { x: number; y: number; width: number; height: number },
  level: 1 | 9 = 9,
): Uint8Array {
  const rowBytes = rect.width * 4;
  const filtered = new Uint8Array((rowBytes + 1) * rect.height);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(rowBytes));
  const zero = new Uint8Array(rowBytes);
  let previous: Uint8Array = zero;
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * stride + rect.x) * 4;
    const current = image.subarray(start, start + rowBytes);
    let best = 0;
    let bestSum = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      const out = candidates[filter] ?? zero;
      const sum = filterRow(filter, current, previous, out);
      if (sum < bestSum) {
        best = filter;
        bestSum = sum;
      }
    }
    const target = row * (rowBytes + 1);
    filtered[target] = best;
    filtered.set(candidates[best] ?? zero, target + 1);
    previous = current;
  }
  return zlibSync(filtered, { level });
}

function filterRow(filter: number, row: Uint8Array, above: Uint8Array, out: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < row.length; index++) {
    const value = row[index] ?? 0;
    const left = index >= 4 ? (row[index - 4] ?? 0) : 0;
    const up = above[index] ?? 0;
    const upLeft = index >= 4 ? (above[index - 4] ?? 0) : 0;
    let predicted = 0;
    if (filter === 1) predicted = left;
    else if (filter === 2) predicted = up;
    else if (filter === 3) predicted = (left + up) >>> 1;
    else if (filter === 4) predicted = paeth(left, up, upLeft);
    const byte = (value - predicted) & 0xff;
    out[index] = byte;
    sum += byte < 128 ? byte : 256 - byte;
  }
  return sum;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}
