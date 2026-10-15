import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultNodeTolerance, resolveTolerance } from "@readmint/golden";
import { comparePng } from "@readmint/golden/node";
import { expect, test } from "vitest";
import { pairFixtures, type FontPair } from "./fontFixtures.js";
import { renderFixture } from "./renderFixture.js";
import suite, {
  decomposedTwins,
  shapingPairNames,
  shapingPairs,
  twinLayers,
} from "./renderer-shaping.golden.js";

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

test.each(Object.keys(decomposedTwins))(
  "%s: the decomposed text renders to the SVG of its precomposed twin, in font and paths mode",
  (name) => {
    const pair = shapingPairs.find((candidate) => candidate.name === name);
    if (pair === undefined) throw new Error(`no pair ${name}`);
    const render = (layers: FontPair["layers"]) =>
      pairFixtures([{ ...pair, layers }]).map((fixture) => renderFixture(fixture.input));
    const decomposed = render(pair.layers);
    expect(decomposed).toHaveLength(2);
    expect(decomposed).toEqual(render(twinLayers(name, 1)));
  },
);
