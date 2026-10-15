import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { licenceBanner } from "../action/scripts/licenceBanner.ts";

const source = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));
const raster = (entry: string) => fileURLToPath(new URL(`../raster/src/${entry}`, import.meta.url));

/** The dev server's hot reload talks to it over a WebSocket; the built app connects nowhere. */
const devConnect: Plugin = {
  name: "readmint-dev-connect",
  apply: "serve",
  transformIndexHtml: (html) => html.replace("connect-src 'none'", "connect-src 'self'"),
};

/** Where a bundled module comes from: every module of either build (the page's and the workers') passes through. */
const bundledModules = new Set<string>();
const collectModules: Plugin = {
  name: "readmint-collect-modules",
  apply: "build",
  transform(_code, id) {
    bundledModules.add(id.split("?")[0] ?? id);
    return null;
  },
};

/**
 * The app ships npm packages (fflate, gifenc, yaml, resvg and libwebp as WebAssembly) whose licences ask for their
 * notices to travel with them: `licences/THIRD-PARTY.txt` holds, for every npm package any bundled module comes from,
 * its name, version, licence and the licence texts, as the Action bundle's banner does (resvg-wasm and libwebp
 * included, whose notices that script supplies).
 */
const thirdPartyLicences: Plugin = {
  name: "readmint-third-party-licences",
  apply: "build",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "licences/THIRD-PARTY.txt",
      source: `${licenceBanner(bundledModules)}
`,
    });
  },
};

// The app is built from the workspace sources, so it never depends on a stale `dist` of another package.
export default defineConfig({
  plugins: [devConnect, collectModules, thirdPartyLicences],
  resolve: {
    alias: [
      { find: /^@readmint\/raster\/browser$/u, replacement: raster("browser.ts") },
      ...["data", "expr", "fonts", "format", "renderer"].map((name) => ({
        find: new RegExp(`^@readmint/${name}$`),
        replacement: source(name),
      })),
    ],
  },
  worker: { format: "es", plugins: () => [collectModules] },
  // Never inlined: the WebAssembly files are fetched by the raster worker from the app's own origin.
  build: {
    outDir: "dist-app",
    emptyOutDir: true,
    target: "es2023",
    assetsInlineLimit: 0,
  },
});
