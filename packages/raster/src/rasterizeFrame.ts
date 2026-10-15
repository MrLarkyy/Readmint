import { Resvg } from "@resvg/resvg-wasm";
import { demultiply } from "./demultiply.js";
import type { RgbaImage } from "./RgbaImage.js";
import { RasterError } from "./RasterError.js";

/**
 * Draws one SVG with resvg at `scale`, with the given fonts and never a system font, as straight RGBA. `initRaster`
 * must have run. The WebAssembly objects are freed at once: the module's memory only grows.
 *
 * resvg 2.6.2 traps (a WebAssembly `unreachable`) on a layer of its own (opacity, clip, symbol) lying beyond twice
 * the canvas. The renderer leaves out such layers wholly off the canvas, but its box is generous, so a few still
 * reach here (very large text or a very wide stroke near the canvas, a turned group far from its centre), and
 * `RasterInput.frame` may hand over any SVG: the trap becomes a `RasterError`, and the module draws the next SVG as
 * before. Each trap leaks the trapped object (`free` throws after one), and after some 1,500 traps in one process
 * the module stops drawing: the CLI and the Action stop at the first, a long-running host should load the module
 * again (a new process or worker) after many.
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
  let image: ReturnType<typeof resvg.render>;
  try {
    image = resvg.render();
  } catch {
    // A trap leaves the object marked as in use, so `free` would throw too: it stays in the module's memory.
    throw new RasterError(
      "raster-image",
      "resvg stopped drawing the SVG; move layers that lie far outside the canvas",
    );
  }
  try {
    return { data: demultiply(image.pixels), width: image.width, height: image.height };
  } finally {
    try {
      image.free();
    } finally {
      resvg.free();
    }
  }
}
