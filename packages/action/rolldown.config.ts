import { readFileSync } from "node:fs";
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
 * The Action's bundle: `action.yml` runs `dist/action.js` with no install step, so every
 * dependency is inside it, and the raster WebAssembly modules lie next to it in `dist/wasm/`.
 * Built from the compiled `dist/main.js` (`pnpm -r build` first). Legal comments stay (the
 * expression locale tables carry the CLDR licence notice) and a banner carries the licence texts
 * of every bundled npm package.
 */
const config: RolldownOptions = {
  input: "dist/main.js",
  platform: "node",
  plugins: [rasterWasm()],
  output: {
    file: "dist/action.js",
    format: "esm",
    comments: { legal: true, annotation: false, jsdoc: false },
    postBanner: (chunk) => licenceBanner(Object.keys(chunk.modules)),
  },
};

export default config;
