import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Design } from "@readmint/format";
import { beforeEach, describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { sniffCache } from "../src/SniffCache.js";
import { sniffImage } from "../src/sniffImage.js";
import { colourImages } from "./colourImages.js";
import { dataUriBytes, jpegWithExif, orientationTiff, toDataUri } from "./exifImages.js";
import { costlyProgressiveJpeg } from "./jpegEntropyCases.js";

const gradient = new Uint8Array(readFileSync(join(import.meta.dirname, "assets", "gradient.jpg")));
const p3Jpeg = dataUriBytes(colourImages.find((row) => row.name.includes("Display P3"))?.uri ?? "");
/** A JPEG whose copy in the SVG differs: its orientation turned upright, its ICC profile removed. */
const turnedP3 = jpegWithExif(p3Jpeg, orientationTiff(6));

function imagesDesign(animated: boolean): Design {
  return {
    version: 0,
    canvas: { width: 64, height: 32 },
    ...(animated ? { animation: { duration: 400 } } : {}),
    assets: {
      images: {
        plain: { src: toDataUri("image/jpeg", gradient) },
        turned: { src: toDataUri("image/jpeg", turnedP3) },
      },
    },
    layers: [
      { type: "image", asset: "plain", x: 0, y: 0, width: 32, height: 32 },
      { type: "image", asset: "turned", x: 32, y: 0, width: 32, height: 32 },
    ],
  };
}

function svgOf(design: Design, time?: number): string {
  const result = renderSvg(design, time === undefined ? {} : { time });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

/** `count` image assets of the same costly JPEG, each drawn once: together past the render's budget. */
function costlyCopies(count: number): Design {
  const src = toDataUri("image/jpeg", costlyProgressiveJpeg());
  const ids = Array.from({ length: count }, (_, index) => `copy${String(index)}`);
  return {
    version: 0,
    canvas: { width: 64, height: 32 },
    assets: { images: Object.fromEntries(ids.map((id) => [id, { src }])) },
    layers: ids.map((asset) => ({ type: "image", asset, x: 0, y: 0, width: 64, height: 32 })),
  };
}

beforeEach(() => {
  sniffCache.clear();
});

describe("renders with the sniff cache", () => {
  test("a repeated render checks no JPEG again and writes the same SVG as from an empty cache", () => {
    const design = imagesDesign(false);
    const cold = svgOf(design);
    const misses = sniffCache.stats.misses;
    expect(misses).toBe(2);
    expect(svgOf(design)).toBe(cold);
    expect(sniffCache.stats.misses).toBe(misses);
    sniffCache.clear();
    expect(svgOf(design)).toBe(cold);
  });

  test("the copy in the SVG is cached as what sniffing it finds", () => {
    const copies = [...svgOf(imagesDesign(false)).matchAll(/href="(data:image\/jpeg;[^"]*)"/g)];
    expect(copies).toHaveLength(2);
    const { hits, misses } = sniffCache.stats;
    const warm = copies.map((match) => sniffImage(dataUriBytes(match[1] ?? ""), 1000));
    expect(sniffCache.stats).toMatchObject({ hits: hits + 2, misses });
    sniffCache.clear();
    const cold = copies.map((match) => sniffImage(dataUriBytes(match[1] ?? ""), 1000));
    expect(warm).toEqual(cold);
  });

  test("every frame of an animation reuses the first frame's checks", () => {
    const design = imagesDesign(true);
    svgOf(design, 0);
    const misses = sniffCache.stats.misses;
    for (const time of [100, 200, 300]) svgOf(design, time);
    expect(sniffCache.stats.misses).toBe(misses);
  });

  test("the budget runs out at the same asset, with the same issue, cold and warm", () => {
    const design = costlyCopies(24);
    const cold = renderSvg(design);
    expect(cold.ok).toBe(false);
    sniffImage(costlyProgressiveJpeg(), 1000);
    const misses = sniffCache.stats.misses;
    const warm = renderSvg(design);
    expect(sniffCache.stats.misses).toBe(misses);
    expect(warm.ok ? [] : warm.issues).toEqual(cold.ok ? [] : cold.issues);
  });
});
