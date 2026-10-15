import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { goldenBrowserCheck } from "./packages/golden/src/vitest/goldenCommands.ts";
import { goldenEnvironment } from "./packages/golden/src/vitest/goldenEnvironment.ts";

const golden = (path: string) =>
  fileURLToPath(new URL(`./packages/golden/src/${path}`, import.meta.url));
const source = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: [
      { find: new RegExp("^@readmint/golden/node$"), replacement: golden("node/index.ts") },
      { find: new RegExp("^@readmint/golden/browser$"), replacement: golden("browser/index.ts") },
      { find: new RegExp("^@readmint/golden/vitest$"), replacement: golden("vitest/index.ts") },
      { find: new RegExp("^@readmint/golden$"), replacement: golden("index.ts") },
      {
        find: new RegExp("^@readmint/data/node$"),
        replacement: fileURLToPath(new URL("./packages/data/src/node/index.ts", import.meta.url)),
      },
      {
        find: new RegExp("^@readmint/raster/browser$"),
        replacement: fileURLToPath(new URL("./packages/raster/src/browser.ts", import.meta.url)),
      },
      ...["cli", "data", "data-github", "expr", "format", "fonts", "raster", "renderer"].map(
        (name) => ({
          find: new RegExp(`^@readmint/${name}$`),
          replacement: source(name),
        }),
      ),
    ],
  },
  test: {
    env: goldenEnvironment(mode),
    // Only a hang detector: the wall-clock bounds that matter are asserted, scaled by load, inside the tests.
    testTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["packages/*/test/**/*.test.ts"],
          exclude: ["**/node_modules/**", "packages/*/test/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          // After the node project: its workers take every core, and a browser test waits on Chromium and on this
          // process (commands, the Node render of each golden) — starved, a golden's first fixture took 15-30 s.
          sequence: { groupOrder: 1 },
          include: ["packages/*/test/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            commands: { goldenBrowserCheck },
          },
        },
      },
    ],
  },
}));
