import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const source = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

/** The dev server's hot reload talks to it over a WebSocket; the built app connects nowhere. */
const devConnect: Plugin = {
  name: "readmint-dev-connect",
  apply: "serve",
  transformIndexHtml: (html) => html.replace("connect-src 'none'", "connect-src 'self'"),
};

// The app is built from the workspace sources, so it never depends on a stale `dist` of another package.
export default defineConfig({
  plugins: [devConnect],
  resolve: {
    alias: ["data", "expr", "fonts", "format", "renderer"].map((name) => ({
      find: new RegExp(`^@readmint/${name}$`),
      replacement: source(name),
    })),
  },
  worker: { format: "es" },
  build: { outDir: "dist-app", emptyOutDir: true, target: "es2023" },
});
