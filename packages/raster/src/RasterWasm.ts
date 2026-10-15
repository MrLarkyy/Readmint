import { createRequire } from "node:module";

export type RasterWasmName = "resvg" | "webpEncoder" | "webpDecoder";

/** The WebAssembly modules raster export loads: the file name a bundle ships each under, and its npm source. */
export const RasterWasm: Readonly<Record<RasterWasmName, { file: string; source: string }>> =
  Object.freeze({
    resvg: { file: "resvg.wasm", source: "@resvg/resvg-wasm/index_bg.wasm" },
    // The SIMD build only: every supported Node has WebAssembly SIMD, and one build keeps the bytes the same everywhere.
    webpEncoder: {
      file: "webp_enc_simd.wasm",
      source: "@jsquash/webp/codec/enc/webp_enc_simd.wasm",
    },
    webpDecoder: { file: "webp_dec.wasm", source: "@jsquash/webp/codec/dec/webp_dec.wasm" },
  });

/** Absolute paths of the modules in `node_modules`, by name. */
export function resolveRasterWasm(): Record<RasterWasmName, string> {
  const require = createRequire(import.meta.url);
  return {
    resvg: require.resolve(RasterWasm.resvg.source),
    webpEncoder: require.resolve(RasterWasm.webpEncoder.source),
    webpDecoder: require.resolve(RasterWasm.webpDecoder.source),
  };
}
