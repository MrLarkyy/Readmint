import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Animation, Colour, Design, Layer } from "@readmint/format";
import { renderSvg } from "@readmint/renderer";
import { PNG } from "pngjs";
import { openNodeWebpCodec } from "./nodeWebpCodec.js";
import type { RasterInput } from "../src/index.js";

const rendererTest = join(import.meta.dirname, "..", "..", "renderer", "test");

/** Montserrat Medium (OFL-1.1, fsType 0), the renderer's test font; see renderer/test/fonts/OFL.txt. */
export const fontPath = join(rendererTest, "fonts", "Montserrat-Medium.ttf");
export const fontBytes: Uint8Array = readFileSync(fontPath);

/** The renderer's own-made 24x16 test PNG. */
export const patternPng: Uint8Array = readFileSync(join(rendererTest, "assets", "pattern.png"));

/** The same pixels as a lossless still WebP, encoded by libwebp. */
export async function patternWebp(): Promise<Uint8Array> {
  const png = PNG.sync.read(Buffer.from(patternPng));
  const codecs = await openNodeWebpCodec();
  return codecs.encodeWebp({
    data: new Uint8Array(png.data),
    width: png.width,
    height: png.height,
  });
}

export function dataUri(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/** What `exportRaster` takes for a design: each frame rendered by `renderSvg` with `time`. */
export function designInput(design: Design, onFrame?: (time?: number) => void): RasterInput {
  const render = (time?: number): string => {
    onFrame?.(time);
    const result = renderSvg(design, time === undefined ? {} : { time });
    if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
    return result.svg;
  };
  const animation = renderSvg(design).ok ? design.animation : undefined;
  return { frame: render, ...(animation === undefined ? {} : { animation }) };
}

function design(
  width: number,
  height: number,
  layers: Layer[],
  extra: { background?: Colour; animation?: Animation; assets?: Design["assets"] } = {},
): Design {
  return {
    version: 0,
    canvas: {
      width,
      height,
      ...(extra.background === undefined ? {} : { background: extra.background }),
    },
    ...(extra.assets === undefined ? {} : { assets: extra.assets }),
    ...(extra.animation === undefined ? {} : { animation: extra.animation }),
    layers,
  };
}

const fontAsset = {
  medium: {
    family: "Montserrat",
    src: dataUri("font/ttf", fontBytes),
    weight: 500,
    licence: { embedding: "allowed" as const, name: "OFL-1.1" },
  },
};

/** Shapes over a transparent canvas, one of them half transparent: straight alpha must survive every format. */
export const shapesDesign = design(64, 32, [
  { type: "rect", x: 2, y: 2, width: 28, height: 28, radius: 6, fill: "#0969da" },
  { type: "ellipse", x: 22, y: 4, width: 36, height: 24, fill: "#cf222e", opacity: 0.5 },
  { type: "path", d: "M4 28 L60 6", fill: "none", stroke: "#1a7f37", strokeWidth: 3 },
]);

export const textDesign = design(
  96,
  28,
  [
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
  { background: "#ffffff", assets: { fonts: fontAsset } },
);

export function imageDesign(src: string): Design {
  return design(32, 24, [{ type: "image", asset: "picture", x: 4, y: 4, width: 24, height: 16 }], {
    background: "#f6f8fa",
    assets: { images: { picture: { src } } },
  });
}

function track(from: number, to: number, duration?: number) {
  return {
    keyframes: [
      { offset: 0, value: from },
      { offset: 1, value: to },
    ],
    ...(duration === undefined ? {} : { duration }),
  };
}

/** A looping slide and fade, 500 ms. */
export const loopDesign = design(
  48,
  24,
  [
    {
      type: "rect",
      x: 2,
      y: 4,
      width: 16,
      height: 16,
      fill: "#8250df",
      animate: { x: track(0, 24), opacity: track(1, 0.4) },
    },
  ],
  { animation: { duration: 500 } },
);

/** Plays once, 400 ms; the move ends at 200 ms, so the later frames are identical and merge. */
export const onceDesign = design(
  48,
  24,
  [
    {
      type: "rect",
      x: 2,
      y: 4,
      width: 16,
      height: 16,
      fill: "#bf3989",
      animate: { x: track(0, 24, 200) },
    },
  ],
  { background: "#ffffff", animation: { duration: 400, loop: false } },
);

/** A seeded, smooth-ish noise picture as a PNG: photo-like pixels that lossless coding handles poorly. */
function noisePng(width: number, height: number): Uint8Array {
  const png = new PNG({ width, height });
  let seed = 12_345;
  const next = (): number => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed >>> 24;
  };
  const clamp = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const base = 128 + 80 * Math.sin(x / 9) * Math.cos(y / 7);
      png.data[at] = clamp(base + (next() % 40) - 20);
      png.data[at + 1] = clamp(base * 0.8 + (next() % 40) - 20);
      png.data[at + 2] = clamp(255 - base + (next() % 40) - 20);
      png.data[at + 3] = 255;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

/** A noisy photo-like picture with a moving element on top, 400 ms: the case lossy WebP is for. */
export const photoDesign = design(
  96,
  64,
  [
    { type: "image", asset: "photo", x: 0, y: 0, width: 96, height: 64 },
    {
      type: "rect",
      x: 4,
      y: 4,
      width: 20,
      height: 20,
      fill: "#ffffff",
      animate: { x: track(0, 60) },
    },
  ],
  {
    animation: { duration: 400 },
    assets: { images: { photo: { src: dataUri("image/png", noisePng(96, 64)) } } },
  },
);
