import type { RolldownOptions } from "rolldown";
import { licenceBanner } from "./scripts/licenceBanner.ts";

/**
 * The Action's single-file bundle: `action.yml` runs `dist/action.js` with no install step, so
 * every dependency is inside it. Built from the compiled `dist/main.js` (`pnpm -r build` first).
 * Legal comments stay (the expression locale tables carry the CLDR licence notice) and a banner
 * carries the licence texts of every bundled npm package.
 */
const config: RolldownOptions = {
  input: "dist/main.js",
  platform: "node",
  output: {
    file: "dist/action.js",
    format: "esm",
    comments: { legal: true, annotation: false, jsdoc: false },
    postBanner: (chunk) => licenceBanner(Object.keys(chunk.modules)),
  },
};

export default config;
