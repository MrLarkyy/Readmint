import { readFile } from "node:fs/promises";
import { loadRasterModules } from "./rasterRuntime.js";
import { RasterWasm, type RasterWasmName, resolveRasterWasm } from "./RasterWasm.js";

/**
 * Loads the rasterizer and compiles libwebp once; later calls return the same promise and ignore `wasmDir`.
 * `wasmDir` is a folder holding the `RasterWasm` files (a bundle ships them there); default: `node_modules`.
 * `exportRaster` calls it itself, so only a bundle needs to.
 */
export function initRaster(wasmDir?: URL): Promise<void> {
  return loadRasterModules(async () => {
    const resolved = wasmDir === undefined ? resolveRasterWasm() : undefined;
    const bytes = (name: RasterWasmName): Promise<Uint8Array> =>
      readFile(resolved?.[name] ?? new URL(RasterWasm[name].file, wasmDir));
    const [resvg, webp] = await Promise.all([bytes("resvg"), bytes("webp")]);
    return { resvg, webp };
  });
}
