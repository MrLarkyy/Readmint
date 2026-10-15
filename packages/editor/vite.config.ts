import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const source = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));
const raster = (entry: string) => fileURLToPath(new URL(`../raster/src/${entry}`, import.meta.url));

/** The dev server's hot reload talks to it over a WebSocket; the built app connects nowhere. */
const devConnect: Plugin = {
  name: "readmint-dev-connect",
  apply: "serve",
  transformIndexHtml: (html) => html.replace("connect-src 'none'", "connect-src 'self'"),
};

const licenceDir = fileURLToPath(new URL("../action/scripts/licences/", import.meta.url));
const licenceFiles = [
  "resvg-wasm.LICENSE",
  "resvg-wasm-crates.txt",
  "libwebp-COPYING",
  "libwebp-PATENTS",
];

/**
 * The app ships resvg and libwebp as WebAssembly, whose licences ask for their notices to travel with them: the
 * texts the Action bundle carries go to `licences/` next to the app, with the MIT licence of wasm-webp itself.
 */
const wasmLicences: Plugin = {
  name: "readmint-wasm-licences",
  apply: "build",
  generateBundle() {
    for (const file of licenceFiles) {
      this.emitFile({
        type: "asset",
        fileName: `licences/${file}`,
        source: readFileSync(join(licenceDir, file)),
      });
    }
    const webpDir = dirname(createRequire(import.meta.url).resolve("wasm-webp/package.json"));
    this.emitFile({
      type: "asset",
      fileName: "licences/wasm-webp.LICENSE",
      source: readFileSync(join(webpDir, "LICENSE")),
    });
  },
};

// The app is built from the workspace sources, so it never depends on a stale `dist` of another package.
export default defineConfig({
  plugins: [devConnect, wasmLicences],
  resolve: {
    alias: [
      { find: /^@readmint\/raster\/browser$/u, replacement: raster("browser.ts") },
      ...["data", "expr", "fonts", "format", "renderer"].map((name) => ({
        find: new RegExp(`^@readmint/${name}$`),
        replacement: source(name),
      })),
    ],
  },
  worker: { format: "es" },
  // Never inlined: the WebAssembly files are fetched by the raster worker from the app's own origin.
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    target: "es2023",
    assetsInlineLimit: 0,
  },
});
