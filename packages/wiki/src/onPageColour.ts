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
  // IHDR width and height sit at bytes 16-23; check them before pngjs allocates the pixels.
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (png.byteLength < 24) throw new Error("not a PNG");
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width > maxSide || height > maxSide) {
    throw new Error(
      `PNG is ${String(width)}x${String(height)}, over the ${String(maxSide)} px side limit`,
    );
  }
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
