import { describe, expect, test } from "vitest";
import { maxRenderEntropySteps } from "@readmint/renderer";
import { countImagePixels } from "../src/countImagePixels.js";
import { RasterError } from "../src/RasterError.js";
import { loadScale } from "../../../test-support/loadScale.js";
import { costlyProgressiveVariant } from "../../renderer/test/jpegEntropyCases.js";
import { dataUri } from "./rasterFixtures.js";

/**
 * An SVG of `count` images of the costly JPEG, as an SVG from elsewhere may hold them, each with bytes of its own:
 * different files, so the sniff cache answers none of them and the budget bounds the work of checking them all.
 */
function svgOf(count: number): string {
  const images = Array.from(
    { length: count },
    (_, index) =>
      `<image width="64" height="32" href="${dataUri("image/jpeg", costlyProgressiveVariant(index))}"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32">${images.join("")}</svg>`;
}

describe("the JPEG symbol-check budget of a raster export", () => {
  test("a few costly copies are counted", () => {
    expect(countImagePixels(svgOf(2), 1)).toMatchObject({ images: 2 });
  });

  test("many costly copies cross the budget shared by every image, quickly", () => {
    const started = performance.now();
    let error: unknown;
    try {
      countImagePixels(svgOf(24), 1);
    } catch (caught) {
      error = caught;
    }
    const elapsed = performance.now() - started;
    expect(error).toBeInstanceOf(RasterError);
    expect(error).toMatchObject({ code: "raster-too-many-image-pixels" });
    expect((error as Error).message).toContain(
      `takes more than ${String(maxRenderEntropySteps)} decoding steps`,
    );
    expect(elapsed).toBeLessThan(3000 * loadScale());
  });
});
