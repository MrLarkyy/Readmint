import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { goldenBrowserCheck } from "./packages/golden/src/vitest/goldenCommands.ts";
import { goldenEnvironment } from "./packages/golden/src/vitest/goldenEnvironment.ts";

export default defineConfig(({ mode }) => ({
  test: {
    env: goldenEnvironment(mode),
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
