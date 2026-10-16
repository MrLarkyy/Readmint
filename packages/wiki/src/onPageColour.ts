import { PNG } from "pngjs";

const maxBytes = 512 * 1024;
const maxSide = 4096;

/** Flattens a PNG onto an opaque page colour (source-over, integer maths) and returns an 8-bit RGB PNG. */
export function onPageColour(
  png: Uint8Array,
  colour: readonly [number, number, number],
): Uint8Array {
  if (png.byteLength > maxBytes) {
    throw new Error(
      `PNG is ${String(png.byteLength)} bytes, over the ${String(maxBytes)} byte limit`,
    );
  }
  checkHeader(png);
  const source = PNG.sync.read(Buffer.from(png));
  const out = new PNG({
    width: source.width,
    height: source.height,
    colorType: 2,
    inputHasAlpha: false,
  });
  for (let i = 0; i < source.width * source.height; i++) {
    const a = source.data[i * 4 + 3] ?? 255;
    for (let c = 0; c < 3; c++) {
      const value = source.data[i * 4 + c] ?? 0;
      out.data[i * 4 + c] = Math.round((value * a + (colour[c] ?? 0) * (255 - a)) / 255);
    }
    out.data[i * 4 + 3] = 255;
  }
  return new Uint8Array(PNG.sync.write(out, { colorType: 2, inputColorType: 6 }));
}

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * pngjs keeps the last IHDR and decodes interlaced files without its size cap, so the chunk list is walked first:
 * exactly one IHDR, first, not interlaced, sides within the limit.
 */
function checkHeader(png: Uint8Array): void {
  if (png.byteLength < 33 || signature.some((byte, i) => png[i] !== byte)) {
    throw new Error("not a PNG");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const type = (at: number): string => String.fromCharCode(...png.subarray(at + 4, at + 8));
  if (view.getUint32(8) !== 13 || type(8) !== "IHDR")
    throw new Error("PNG does not start with IHDR");
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width > maxSide || height > maxSide) {
    throw new Error(
      `PNG is ${String(width)}x${String(height)}, over the ${String(maxSide)} px side limit`,
    );
  }
  if (png[28] !== 0) throw new Error("interlaced PNG is not accepted");
  for (let at = 8; at + 12 <= png.byteLength;) {
    const name = type(at);
    if (at > 8 && name === "IHDR") throw new Error("PNG has more than one IHDR");
    if (name === "IEND") return;
    at += 12 + view.getUint32(at);
  }
}
