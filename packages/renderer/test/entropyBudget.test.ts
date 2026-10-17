import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { timed } from "../../../test-support/loadScale.js";
import { maxRenderEntropySteps } from "../src/EntropyBudget.js";
import { renderSvg } from "../src/index.js";
import { sniffImage } from "../src/sniffImage.js";
import { toDataUri } from "./exifImages.js";
import { costlyProgressiveJpeg, costlyProgressiveVariant } from "./jpegEntropyCases.js";

const costly = costlyProgressiveJpeg();

/**
 * `count` image assets of the costly JPEG, each drawn once, each with bytes of its own: different files, so the sniff
 * cache answers none of them and the budget bounds the work of checking them all.
 */
function copies(count: number): Design {
  const ids = Array.from({ length: count }, (_, index) => `copy${String(index)}`);
  return {
    version: 0,
    canvas: { width: 64, height: 32 },
    assets: {
      images: Object.fromEntries(
        ids.map((id, index) => [
          id,
          { src: toDataUri("image/jpeg", costlyProgressiveVariant(index)) },
        ]),
      ),
    },
    layers: ids.map((asset) => ({ type: "image", asset, x: 0, y: 0, width: 64, height: 32 })),
  };
}

describe("the JPEG symbol-check budget of a render", () => {
  test("one costly copy is an accepted image well under the budget", () => {
    expect(costly.length).toBeLessThan(12_000);
    expect(sniffImage(costly, 1)).toMatchObject({ ok: true, info: { width: 1024, height: 512 } });
    expect(renderSvg(copies(2)).ok).toBe(true);
  });

  test("many costly copies cross the budget shared by every image, quickly", () => {
    const { value: result, ms: elapsed, scale } = timed(() => renderSvg(copies(24)));
    expect(result.ok).toBe(false);
    const issue = result.ok ? undefined : result.issues[0];
    expect(issue?.code).toBe("asset-too-large");
    expect(issue?.path).toMatch(/^\/assets\/images\/copy\d+\/src$/);
    expect(issue?.message).toContain(
      `takes more than ${String(maxRenderEntropySteps)} decoding steps`,
    );
    expect(elapsed).toBeLessThan(3000 * scale);
  });
});
