import type { OutputBudget } from "./OutputBudget.js";
import { compressRgba, ihdr, PngWriter } from "./PngWriter.js";

/** A still PNG of straight RGBA pixels. */
export function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  budget: OutputBudget,
): Uint8Array {
  const writer = new PngWriter(budget);
  writer.chunk("IHDR", ihdr(width, height));
  writer.chunk("IDAT", compressRgba(pixels, width, { x: 0, y: 0, width, height }));
  writer.chunk("IEND", new Uint8Array(0));
  return writer.bytes();
}
