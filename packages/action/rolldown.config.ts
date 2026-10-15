import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RasterWasm, type RasterWasmName, resolveRasterWasm } from "@readmint/raster";
import type { Plugin, RolldownOptions } from "rolldown";
import { licenceBanner } from "./scripts/licenceBanner.ts";

/** Puts the raster WebAssembly modules into `dist/wasm/`, where `main.ts` points `initRaster`. */
function rasterWasm(): Plugin {
  return {
    name: "readmint-raster-wasm",
    generateBundle() {
      const paths = resolveRasterWasm();
      for (const name of Object.keys(RasterWasm) as RasterWasmName[]) {
        this.emitFile({
          type: "asset",
          fileName: `wasm/${RasterWasm[name].file}`,
          source: readFileSync(paths[name]),
        });
      }
    },
  };
}

/**
 * brotli's decoder reads its dictionary from a 756 kB JavaScript file in Node and from a 69 kB
 * compressed copy (decompressed once, to the same bytes) in browsers. The bundle takes the small one.
 */
const brotliDictionary: Plugin = {
  name: "brotli-dictionary",
  resolveId(source, importer) {
    if (source !== "./dictionary-data" || importer === undefined) return undefined;
    if (!/[\\/]brotli[\\/]dec[\\/]dictionary\.js$/u.test(importer)) return undefined;
    return join(dirname(importer), "dictionary-browser.js");
  },
};

/**
 * The Action's bundle: `action.yml` runs `dist/action.js` with no install step, so every
 * dependency is inside it, and the raster WebAssembly modules lie next to it in `dist/wasm/`.
 * Built from the compiled `dist/main.js` (`pnpm -r build` first). Legal comments stay (the
 * expression locale tables carry the CLDR licence notice) and a banner carries the licence texts
 * of every bundled npm package (scripts/licences adds texts a package does not ship).
 */
const config: RolldownOptions = {
  input: "dist/main.js",
  platform: "node",
  plugins: [rasterWasm(), brotliDictionary],
  output: {
    file: "dist/action.js",
    format: "esm",
    comments: { legal: true, annotation: false, jsdoc: false },
    postBanner: (chunk) => licenceBanner(Object.keys(chunk.modules)),
  },
};

export default config;
