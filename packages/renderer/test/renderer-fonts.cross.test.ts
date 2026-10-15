import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultNodeTolerance, resolveTolerance } from "@readmint/golden";
import { comparePng } from "@readmint/golden/node";
import { describe, expect, test } from "vitest";
import formats, { formatPairNames } from "./renderer-fonts-formats.golden.js";
import fonts, { fontPairNames } from "./renderer-fonts.golden.js";

const goldenDir = join(import.meta.dirname, "golden");

describe.each([
  [fonts, fontPairNames],
  [formats, formatPairNames],
] as const)(
  "$0.name: text drawn as paths looks like text drawn with the embedded font",
  (suite, names) => {
    test.each(names)("%s", (name) => {
      const png = (variant: string) =>
        readFileSync(join(goldenDir, suite.name, `${name}-${variant}.png`));
      const comparison = comparePng(
        png("font"),
        png("paths"),
        resolveTolerance(suite.tolerance, defaultNodeTolerance),
      );
      expect(comparison.reason).toBeUndefined();
      expect(comparison.diffPixels).toBe(0);
    });
  },
);
