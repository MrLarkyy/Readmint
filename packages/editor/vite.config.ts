import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const source = (name: string) => fileURLToPath(new URL(`../${name}/src/index.ts`, import.meta.url));

// The app is built from the workspace sources, so it never depends on a stale `dist` of another package.
export default defineConfig({
  resolve: {
    alias: ["data", "expr", "fonts", "format", "renderer"].map((name) => ({
      find: new RegExp(`^@readmint/${name}$`),
      replacement: source(name),
    })),
  },
  worker: { format: "es" },
  build: { outDir: "dist-app", emptyOutDir: true, target: "es2023" },
});
