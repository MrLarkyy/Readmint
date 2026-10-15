import { defineGoldenSuite } from "@readmint/golden";
import type { ImageLayer, Layer } from "@readmint/format";
import { colourImages } from "./colourImages.js";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { exifJpeg, exifPng, imageAssets } from "./testAssets.js";

/** EXIF-oriented copies: the PNG turned a quarter clockwise (6), the JPEG a quarter anticlockwise (8). */
const exifAssets = { png6: exifPng(6), jpeg8: exifJpeg(8) };

function design(
  image: Omit<ImageLayer, "type" | "x" | "y">,
  images: Record<string, { src: string }> = imageAssets,
): RenderFixture {
  return {
    design: {
      version: 0,
      canvas: { width: 80, height: 60, background: "#eaeef2" },
      assets: { images },
      layers: [
        {
          type: "rect",
          x: 10,
          y: 10,
          width: image.width,
          height: image.height,
          fill: "none",
          stroke: "#57606a",
          strokeWidth: 1,
        },
        { type: "image", x: 10, y: 10, ...image },
      ],
    },
  };
}

/** One asset drawn twice in each fit: the data is written once, every copy is a `<use>` of a symbol per fit. */
function repeated(): RenderFixture {
  const frame = (x: number, y: number, width: number, height: number): Layer => ({
    type: "rect",
    x,
    y,
    width,
    height,
    fill: "none",
    stroke: "#57606a",
    strokeWidth: 1,
  });
  const image = (
    [x, y, width, height]: [number, number, number, number],
    extra: Partial<ImageLayer>,
  ): Layer[] => [
    frame(x, y, width, height),
    { type: "image", asset: "png", x, y, width, height, ...extra },
  ];
  return {
    design: {
      version: 0,
      canvas: { width: 160, height: 100, background: "#eaeef2" },
      assets: { images: imageAssets },
      layers: [
        ...image([6, 6, 40, 24], { fit: "contain", alt: "contain" }),
        ...image([54, 6, 20, 30], { fit: "contain", opacity: 0.5 }),
        ...image([82, 6, 16, 30], { fit: "cover" }),
        ...image([106, 6, 44, 16], { fit: "cover", rotation: 20 }),
        ...image([6, 52, 60, 20], { fit: "fill" }),
        ...image([80, 56, 30, 36], { fit: "fill", rotation: -30, opacity: 0.7 }),
      ],
    },
  };
}

/**
 * Every colour fixture Chromium colour-manages, but the WebP ones (no WebP golden, see below), at its own size: the
 * renderer removes the profile, so Chromium draws the stored colours resvg draws, within the browser tolerance.
 */
function colourProfiles(): RenderFixture {
  const applied = colourImages.filter((row) => row.chromiumApplies && row.mime !== "image/webp");
  return {
    design: {
      version: 0,
      canvas: { width: 80, height: 64, background: "#eaeef2" },
      assets: {
        images: Object.fromEntries(
          applied.map((row, index) => [`c${String(index)}`, { src: row.uri }]),
        ),
      },
      layers: applied.map((_row, index) => ({
        type: "image" as const,
        asset: `c${String(index)}`,
        x: 6 + (index % 2) * 38,
        y: 4 + Math.floor(index / 2) * 20,
        width: 32,
        height: 16,
        fit: "fill" as const,
      })),
    },
  };
}

export default defineGoldenSuite<RenderFixture>({
  name: "renderer-images",
  render: renderFixture,
  fixtures: [
    {
      name: "image-png-fill",
      scale: 2,
      input: design({ asset: "png", width: 60, height: 20, fit: "fill", alt: "pattern" }),
    },
    {
      name: "image-jpeg-contain",
      scale: 2,
      input: design({ asset: "jpeg", width: 40, height: 40, fit: "contain" }),
    },
    // WebP has no golden: resvg-js 2.6.2 (the Node rasterizer) cannot decode WebP, so the Node PNG would show
    // nothing where Chromium draws the image. sniffImage.test.ts and selfContained.test.ts cover WebP instead.
    {
      name: "image-png-cover",
      scale: 2,
      input: design({ asset: "png", width: 16, height: 24, fit: "cover" }),
    },
    {
      name: "image-gif-animated",
      scale: 2,
      input: design({ asset: "gif", width: 32, height: 32, alt: "first frame of an animation" }),
    },
    { name: "image-repeat", scale: 2, input: repeated() },
    // The stored pixels lie on their side; resvg ignores EXIF and Chromium honours it, so both drawing the same
    // upright picture shows the orientation came from the renderer's transform alone.
    {
      name: "image-exif-png-6-contain",
      scale: 2,
      input: design({ asset: "png6", width: 60, height: 30, fit: "contain" }, exifAssets),
    },
    {
      name: "image-exif-png-6-cover",
      scale: 2,
      input: design({ asset: "png6", width: 40, height: 20, fit: "cover" }, exifAssets),
    },
    {
      name: "image-exif-png-6-fill",
      scale: 2,
      input: design({ asset: "png6", width: 60, height: 20, fit: "fill" }, exifAssets),
    },
    {
      name: "image-exif-jpeg-8-cover",
      scale: 2,
      input: design({ asset: "jpeg8", width: 40, height: 30, fit: "cover" }, exifAssets),
    },
    { name: "image-colour-profiles", scale: 2, input: colourProfiles() },
  ],
});
