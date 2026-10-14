import type { RolldownOptions } from "rolldown";

/**
 * The Action's single-file bundle: `action.yml` runs `dist/action.js` with no install step, so
 * every dependency is inside it. Built from the compiled `dist/main.js` (`pnpm -r build` first).
 * Legal comments stay: the expression locale tables carry the CLDR licence notice.
 */
const config: RolldownOptions = {
  input: "dist/main.js",
  platform: "node",
  output: {
    file: "dist/action.js",
    format: "esm",
    comments: { legal: true, annotation: false, jsdoc: false },
  },
};

export default config;
