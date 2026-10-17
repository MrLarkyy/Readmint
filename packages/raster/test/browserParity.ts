import type { Design } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import pattern from "../../renderer/test/assets/pattern.png?inline";
import tall from "../../renderer/test/assets/tall.webp?inline";
import font from "../../renderer/test/fonts/Montserrat-Medium.ttf?inline";
import type { RasterFormat } from "../src/RasterFormat.js";
import type { RasterInput } from "../src/RasterInput.js";
import type { RasterOptions } from "../src/RasterOptions.js";

/** Designs that need no Node API to load, so the Node and the Chromium test export the same ones. */
const shapes: Design = {
  version: 0,
  canvas: { width: 64, height: 32 },
  layers: [
    { type: "rect", x: 2, y: 2, width: 28, height: 28, radius: 6, fill: "#0969da" },
    { type: "ellipse", x: 22, y: 4, width: 36, height: 24, fill: "#cf222e", opacity: 0.5 },
    { type: "path", d: "M4 28 L60 6", fill: "none", stroke: "#1a7f37", strokeWidth: 3 },
  ],
};

const text: Design = {
  version: 0,
  canvas: { width: 96, height: 28, background: "#ffffff" },
  assets: {
    fonts: {
      medium: {
        family: "Montserrat",
        src: font,
        weight: 500,
        licence: { embedding: "allowed", name: "OFL-1.1" },
      },
    },
  },
  layers: [
    {
      type: "text",
      x: 4,
      y: 6,
      content: "Readmint",
      font: "medium",
      fontSize: 16,
      fill: "#1f2328",
    },
  ],
};

function pictureDesign(src: string): Design {
  return {
    version: 0,
    canvas: { width: 32, height: 24, background: "#f6f8fa" },
    assets: { images: { picture: { src } } },
    layers: [{ type: "image", asset: "picture", x: 4, y: 4, width: 24, height: 16 }],
  };
}

const pngImage = pictureDesign(pattern);
const webpImage = pictureDesign(tall);

const loop: Design = {
  version: 0,
  canvas: { width: 48, height: 24 },
  animation: { duration: 500 },
  layers: [
    {
      type: "rect",
      x: 2,
      y: 4,
      width: 16,
      height: 16,
      fill: "#8250df",
      animate: {
        x: {
          keyframes: [
            { offset: 0, value: 0 },
            { offset: 1, value: 24 },
          ],
        },
        opacity: {
          keyframes: [
            { offset: 0, value: 1 },
            { offset: 1, value: 0.4 },
          ],
        },
      },
    },
  ],
};

export interface ParityCase {
  readonly name: string;
  readonly design: Design;
  readonly format: RasterFormat;
  /** Export options besides the format: what makes a case sample at a fitted default rate, say. */
  readonly options?: Partial<RasterOptions>;
}

export const parityCases: readonly ParityCase[] = [
  { name: "shapes", design: shapes, format: "png" },
  { name: "shapes", design: shapes, format: "webp" },
  { name: "text", design: text, format: "png" },
  { name: "text", design: text, format: "webp" },
  { name: "loop", design: loop, format: "webp" },
  { name: "loop-fitted", design: loop, format: "webp", options: { limits: { maxFrames: 10 } } },
  { name: "image-png", design: pngImage, format: "png" },
  { name: "image-webp", design: webpImage, format: "png" },
];

/**
 * SHA-256 of the file each case exports: the same in Node and in Chromium (V8 and libwebp's WebAssembly do not
 * depend on the host). A change here is a change of the rasterizer's output and needs a reason.
 */
export const parityPins: Readonly<Record<string, string>> = {
  "shapes.png": "36e4438141f6e30b74bfd9ac7d1743b0e8e81ef5e7b9c01a00e7cd286811f954",
  "shapes.webp": "2d64686e065bcdf5c470c793c5d0aa844ecd8bd624e81202f45c7b35b04cb5db",
  "text.png": "c4b41334149956a65e8b2d13d239cfda183fae9899ad5f240391fd6af698efef",
  "text.webp": "6a0651113a23811f26913825e4cffe0b1720a51bf05e916089d4c40918181f13",
  "image-png.png": "a23070b974339260462aa8a7ba44760a8f644bbfc66b75aca058446bf3bc52da",
  "image-webp.png": "7359fa4645e6160c3666122429dc241e0a4f78123b6b65a0332f3d9a4e0ac68c",
  "loop.webp": "db864fbe90c5b8121598ba4f5509fc8cee0fdbdbeea2d5c004414a3c359a8734",
  "loop-fitted.webp": "06b8c569db17339d39f610f3a2524b4e7f0de8adaa716b8f41f39a9c348a589e",
};

export function parityKey(item: ParityCase): string {
  return `${item.name}.${item.format}`;
}

export function parityInput(design: Design): RasterInput {
  const frame = (time?: number): string => {
    const result = renderSvg(design, time === undefined ? {} : { time });
    if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
    return result.svg;
  };
  const first = renderSvg(design);
  return {
    frame,
    ...(first.ok && first.report.animation !== undefined
      ? { animation: first.report.animation }
      : {}),
  };
}
