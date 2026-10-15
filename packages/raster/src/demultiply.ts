/**
 * Straight RGBA from the rasterizer's premultiplied pixels, rounded exactly as resvg's own PNG output rounds them
 * (tiny-skia: `channel / (alpha / 255) + 0.5`, truncated and saturated), so a PNG of these pixels equals its PNG.
 */
export function demultiply(premultiplied: Uint8Array): Uint8Array {
  const out = new Uint8Array(premultiplied.length);
  for (let index = 0; index < premultiplied.length; index += 4) {
    const alpha = premultiplied[index + 3] ?? 0;
    if (alpha === 0) continue;
    out[index + 3] = alpha;
    if (alpha === 255) {
      out[index] = premultiplied[index] ?? 0;
      out[index + 1] = premultiplied[index + 1] ?? 0;
      out[index + 2] = premultiplied[index + 2] ?? 0;
      continue;
    }
    const factor = alpha / 255;
    for (let channel = 0; channel < 3; channel++) {
      out[index + channel] = Math.min(
        255,
        Math.trunc((premultiplied[index + channel] ?? 0) / factor + 0.5),
      );
    }
  }
  return out;
}
