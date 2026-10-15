import type { RasterWorker } from "./RasterClient.js";

/** A raster worker: an ES module worker the app build emits as its own chunk, loaded when an export starts. */
export function createRasterWorker(): RasterWorker {
  return new Worker(new URL("./rasterWorker.ts", import.meta.url), {
    type: "module",
    name: "readmint-raster",
  });
}
