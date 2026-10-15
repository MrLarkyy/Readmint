import type { Shaper } from "./Shaper.js";

/**
 * The shaper of every script without its own (HarfBuzz's default shaper): the font's features in one stage, marks
 * zeroed by GDEF after GPOS, nothing reordered.
 */
export function defaultShaper(scriptTags: readonly string[]): Shaper {
  return {
    scriptTags,
    zeroMarks: "late",
    collectFeatures: () => undefined,
    setup: () => undefined,
  };
}
