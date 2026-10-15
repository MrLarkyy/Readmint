import { Resvg } from "@resvg/resvg-wasm";
import { demultiply } from "./demultiply.js";
import type { RgbaImage } from "./RasterCodecs.js";
import { RasterError } from "./RasterError.js";

/**
 * Draws one SVG with resvg at `scale`, with the given fonts and never a system font, as straight RGBA. `initRaster`
 * must have run. The WebAssembly objects are freed at once: the module's memory only grows.
 */
export function rasterizeFrame(
  svg: string,
  scale: number,
  fonts: readonly Uint8Array[],
): RgbaImage {
  let resvg: InstanceType<typeof Resvg>;
  try {
    resvg = new Resvg(svg, {
      fitTo: { mode: "zoom", value: scale },
      font: { fontBuffers: [...fonts] },
    });
  } catch {
    throw new RasterError("raster-image", "the rasterizer cannot read the SVG");
  }
  try {
    const image = resvg.render();
    try {
      return { data: demultiply(image.pixels), width: image.width, height: image.height };
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
