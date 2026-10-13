import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { GoldenTolerance } from "../GoldenTolerance.js";

export const maxPngSide = 4096;

export interface PngComparison {
  pass: boolean;
  diffPixels: number;
  totalPixels: number;
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
  const a = PNG.sync.read(Buffer.from(expected));
  const b = PNG.sync.read(Buffer.from(actual));
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
  return {
    pass: diffPixels / totalPixels <= tolerance.maxDiffRatio,
    diffPixels,
    totalPixels,
    diffPng: PNG.sync.write(diff),
  };
}

function failure(reason: string): PngComparison {
  return { pass: false, diffPixels: 0, totalPixels: 0, reason };
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
