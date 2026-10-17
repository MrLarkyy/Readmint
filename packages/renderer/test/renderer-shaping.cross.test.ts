import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Layer } from "@readmint/format";
import { defaultNodeTolerance, resolveTolerance } from "@readmint/golden";
import { comparePng } from "@readmint/golden/node";
import { pathInkTolerance } from "./pathInkTolerance.js";
import { expect, test } from "vitest";
import { pairFixtures, type FontPair } from "./fontFixtures.js";
import { renderFixture } from "./renderFixture.js";
import suite, {
  arabicModifierMarks,
  arabicModifierMarkSpellings,
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
      resolveTolerance({ maxTileInk: pathInkTolerance, ...suite.tolerance }, defaultNodeTolerance),
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

test("equivalent spellings of Arabic modifier marks render to one SVG, in font and paths mode", () => {
  const pair = shapingPairs.find((candidate) => candidate.name === "arabic-modifier-marks");
  if (pair === undefined) throw new Error("no pair arabic-modifier-marks");
  const render = (content: string) =>
    pairFixtures([
      { ...pair, layers: pair.layers.map((layer) => ({ ...layer, content }) as Layer) },
    ]).map((fixture) => renderFixture(fixture.input));
  const expected = render(arabicModifierMarks);
  expect(expected).toHaveLength(2);
  for (const spelling of arabicModifierMarkSpellings) expect(render(spelling)).toEqual(expected);
});
