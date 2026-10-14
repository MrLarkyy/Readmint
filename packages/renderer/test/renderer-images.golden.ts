import { defineGoldenSuite } from "@readmint/golden";
import type { ImageLayer } from "@readmint/format";
import { renderFixture, type RenderFixture } from "./renderFixture.js";
import { imageAssets } from "./testAssets.js";

function design(image: Omit<ImageLayer, "type" | "x" | "y">): RenderFixture {
  return {
    design: {
      version: 0,
      canvas: { width: 80, height: 60, background: "#eaeef2" },
      assets: { images: imageAssets },
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
  ],
});
