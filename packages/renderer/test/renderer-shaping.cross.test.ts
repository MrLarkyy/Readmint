import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultNodeTolerance, resolveTolerance } from "@readmint/golden";
import { comparePng } from "@readmint/golden/node";
import { expect, test } from "vitest";
import suite, { shapingPairNames } from "./renderer-shaping.golden.js";

const goldenDir = join(import.meta.dirname, "golden", suite.name);

test.each(shapingPairNames)(
  "%s: shaped text drawn from the embedded subsets looks like the same text drawn as paths",
  (name) => {
    const png = (variant: string) => readFileSync(join(goldenDir, `${name}-${variant}.png`));
    const comparison = comparePng(
      png("font"),
      png("paths"),
      resolveTolerance(suite.tolerance, defaultNodeTolerance),
    );
    expect(comparison.reason).toBeUndefined();
    expect(comparison.diffPixels).toBe(0);
  },
);
