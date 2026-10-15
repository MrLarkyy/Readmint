import { loadRasterModules } from "./rasterRuntime.js";
import type { RasterModules } from "./RasterWasmBytes.js";

/**
 * Loads the rasterizer from the bytes of its two WebAssembly modules (`RasterWasm` names them) and compiles libwebp
 * once; later calls return the same promise and ignore `modules`. Nothing is fetched here. libwebp compiles
 * synchronously, so a browser calls this and `exportRaster` in a worker.
 */
export function initRaster(modules: RasterModules): Promise<void> {
  return loadRasterModules(() => Promise.resolve(modules));
}
