import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { GoldenTolerance } from "../GoldenTolerance.js";
import { tileInkShift } from "./tileInkShift.js";

export const maxPngSide = 4096;

export interface PngComparison {
  pass: boolean;
  diffPixels: number;
  totalPixels: number;
  /** Worst 16 px tile ink change as a share of the tile; 0 when the images were not comparable. */
  inkShift: number;
  reason?: string;
  diffPng?: Buffer;
}

export function comparePng(
  expected: Uint8Array,
  actual: Uint8Array,
  tolerance: GoldenTolerance,
): PngComparison {
  const rejected = rejectUnusable(expected, "golden") ?? rejectUnusable(actual, "rendered");
  if (rejected !== undefined) return failure(rejected);
  let a: PNG;
  let b: PNG;
  try {
    a = PNG.sync.read(Buffer.from(expected));
  } catch {
    return failure("golden image is corrupt and cannot be decoded");
  }
  try {
    b = PNG.sync.read(Buffer.from(actual));
  } catch {
    return failure("rendered image is corrupt and cannot be decoded");
  }
  if (a.width !== b.width || a.height !== b.height) {
    return failure(
      `size ${String(b.width)}x${String(b.height)} differs from golden ${String(a.width)}x${String(a.height)}`,
    );
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: tolerance.threshold,
    includeAA: tolerance.includeAA,
  });
  const totalPixels = a.width * a.height;
  const ink = tileInkShift(a, b);
  const ratioOk = diffPixels / totalPixels <= tolerance.maxDiffRatio;
  const inkOk = ink.shift <= tolerance.maxTileInk;
  const comparison: PngComparison = {
    pass: ratioOk && inkOk,
    diffPixels,
    totalPixels,
    inkShift: ink.shift,
    diffPng: PNG.sync.write(diff),
  };
  if (ratioOk && !inkOk) {
    comparison.reason = `ink of the 16x16 tile at ${String(ink.x)},${String(ink.y)} changed by ${percent(ink.shift)} % (limit ${percent(tolerance.maxTileInk)} %)`;
  }
  return comparison;
}

function percent(share: number): string {
  return (share * 100).toFixed(2);
}

function failure(reason: string): PngComparison {
  return { pass: false, diffPixels: 0, totalPixels: 0, inkShift: 0, reason };
}

// The header is read before decoding so an oversized image never gets allocated.
function rejectUnusable(png: Uint8Array, label: string): string | undefined {
  const header = Buffer.from(png.subarray(0, 24));
  if (header.length < 24 || header.toString("latin1", 12, 16) !== "IHDR")
    return `${label} image is not a PNG`;
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width > maxPngSide || height > maxPngSide) {
    return `${label} image ${String(width)}x${String(height)} exceeds ${String(maxPngSide)}x${String(maxPngSide)}`;
  }
  return undefined;
}
