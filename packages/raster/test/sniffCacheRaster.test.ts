import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { beforeEach, describe, expect, test } from "vitest";
import { sniffCache } from "../../renderer/src/SniffCache.js";
import { jpegWithExif, orientationTiff } from "../../renderer/test/exifImages.js";
import { countImagePixels } from "../src/countImagePixels.js";
import { exportRaster } from "../src/index.js";
import { dataUri, designInput } from "./rasterFixtures.js";

const rendererAssets = join(import.meta.dirname, "..", "..", "renderer", "test", "assets");
const read = (name: string) => new Uint8Array(readFileSync(join(rendererAssets, name)));

/** Two JPEGs, one turned by EXIF and colour-tagged: the SVG holds copies of both, not their original bytes. */
function jpegDesign(animated: boolean): Design {
  return {
    version: 0,
    canvas: { width: 64, height: 32 },
    ...(animated ? { animation: { duration: 300 } } : {}),
    assets: {
      images: {
        plain: { src: dataUri("image/jpeg", read("jpeg/progressive.jpg")) },
        turned: {
          src: dataUri(
            "image/jpeg",
            jpegWithExif(read("colour/jpeg-p3-icc.jpg"), orientationTiff(6)),
          ),
        },
      },
    },
    layers: [
      { type: "image", asset: "plain", x: 0, y: 0, width: 32, height: 32 },
      { type: "image", asset: "turned", x: 32, y: 0, width: 32, height: 32 },
    ],
  };
}

function svgOf(design: Design): string {
  const result = renderSvg(design);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

beforeEach(() => {
  sniffCache.clear();
});

describe("the raster pass with the renderer's sniff cache", () => {
  test("counting the images of a rendered SVG checks no JPEG again, and counts as from an empty cache", () => {
    const svg = svgOf(jpegDesign(false));
    const misses = sniffCache.stats.misses;
    expect(misses).toBe(2);
    const warm = countImagePixels(svg, 3);
    expect(sniffCache.stats.misses).toBe(misses);
    sniffCache.clear();
    expect(countImagePixels(svg, 3)).toEqual(warm);
    expect(sniffCache.stats.misses).toBe(2);
  });

  test("an animated export checks each JPEG once, not once per frame", async () => {
    const frames: (number | undefined)[] = [];
    await exportRaster(
      designInput(jpegDesign(true), (time) => frames.push(time)),
      { format: "apng", frameRate: 10, scale: 1 },
    );
    // 300 ms at 10 frames a second: three renders of their own, besides the one `designInput` makes.
    expect(frames).toEqual([0, 100, 200]);
    expect(sniffCache.stats.misses).toBe(2);
  });
});
