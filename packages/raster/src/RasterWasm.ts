import { createRequire } from "node:module";

export type RasterWasmName = "resvg" | "webp";

/** The WebAssembly modules raster export loads: the file name a bundle ships each under, and its npm source. */
export const RasterWasm: Readonly<Record<RasterWasmName, { file: string; source: string }>> =
  Object.freeze({
    resvg: { file: "resvg.wasm", source: "@resvg/resvg-wasm/index_bg.wasm" },
    webp: { file: "webp.wasm", source: "wasm-webp/dist/esm/webp-wasm.wasm" },
  });

/** Absolute paths of the modules in `node_modules`, by name. */
export function resolveRasterWasm(): Record<RasterWasmName, string> {
  const require = createRequire(import.meta.url);
  return {
    resvg: require.resolve(RasterWasm.resvg.source),
    webp: require.resolve(RasterWasm.webp.source),
  };
}
