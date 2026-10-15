import { defaultBrowserTolerance, resolveTolerance } from "@readmint/golden";
import { describe, expect, test } from "vitest";

import shaping, { shapingPairNames } from "./renderer-shaping.golden.js";
import { renderFixture } from "./renderFixture.js";

/** RGBA pixels of an SVG drawn by Chromium itself at `scale`. */
async function pixels(svg: string, scale: number): Promise<ImageData> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2d canvas is not available");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Share of pixels whose largest channel difference passes `threshold` (0..1). */
function differingShare(a: ImageData, b: ImageData, threshold: number): number {
  let differing = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    let largest = 0;
    for (let channel = 0; channel < 4; channel++) {
      largest = Math.max(
        largest,
        Math.abs((a.data[index + channel] ?? 0) - (b.data[index + channel] ?? 0)),
      );
    }
    if (largest / 255 > threshold) differing++;
  }
  return differing / (a.data.length / 4);
}

describe.each([[shaping, shapingPairNames]] as const)(
  "$0.name in Chromium: shaped text drawn as paths looks like the embedded subsets",
  (suite, names) => {
    test.each(names)("%s", async (name) => {
      const fixture = (variant: string) => {
        const found = suite.fixtures.find((candidate) => candidate.name === `${name}-${variant}`);
        if (found === undefined) throw new Error(`${name}-${variant}`);
        return found;
      };
      const tolerance = resolveTolerance(suite.browserTolerance, defaultBrowserTolerance);
      const font = await pixels(renderFixture(fixture("font").input), 2);
      const paths = await pixels(renderFixture(fixture("paths").input), 2);
      expect(differingShare(font, paths, tolerance.threshold)).toBeLessThanOrEqual(
        tolerance.maxDiffRatio,
      );
    });
  },
);
