import { exportRaster as exportRasterLoaded } from "./exportRaster.js";
import { initRaster } from "./initRaster.js";
import type { RasterInput } from "./RasterInput.js";
import type { RasterOptions } from "./RasterOptions.js";
import type { RasterOutput } from "./RasterOutput.js";

/** `exportRaster` for Node: loads the rasterizer from `node_modules` first (see `initRaster`), then exports. */
export async function exportRaster(
  input: RasterInput,
  options: RasterOptions,
): Promise<RasterOutput> {
  await initRaster();
  return exportRasterLoaded(input, options);
}
