import resvgUrl from "@resvg/resvg-wasm/index_bg.wasm?url";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { beforeAll, expect, test } from "vitest";
import { jpegChannelTolerance, lossyJpegs } from "./jpegDecoderTolerance.js";

function size(uri: string): { width: number; height: number } {
  const binary = atob(uri.slice(uri.indexOf(",") + 1));
  for (let at = 2; at + 9 < binary.length;) {
    const marker = binary.charCodeAt(at + 1);
    const length = (binary.charCodeAt(at + 2) << 8) | binary.charCodeAt(at + 3);
    if (marker >= 0xc0 && marker <= 0xc2) {
      return {
        height: (binary.charCodeAt(at + 5) << 8) | binary.charCodeAt(at + 6),
        width: (binary.charCodeAt(at + 7) << 8) | binary.charCodeAt(at + 8),
      };
    }
    at += 2 + length;
  }
  throw new Error("no frame header");
}

function svgOf(uri: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}"><image width="${String(width)}" height="${String(height)}" href="${uri}"/></svg>`;
}

/** The few browser APIs used; the package compiles without the DOM library, which would leak into its Node code. */
interface Browser {
  readonly Image: new () => { src: string; decode(): Promise<void> };
  readonly document: {
    createElement(tag: "canvas"): {
      width: number;
      height: number;
      getContext(kind: "2d"): {
        drawImage(image: unknown, x: number, y: number): void;
        getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
      } | null;
    };
  };
}

/** The RGBA pixels of an SVG drawn by Chromium itself at its size. */
async function chromiumPixels(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8ClampedArray> {
  const browser = globalThis as unknown as Browser;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new browser.Image();
    image.src = url;
    await image.decode();
    const canvas = browser.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("2d canvas is not available");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function resvgPixels(svg: string): Uint8Array {
  const resvg = new Resvg(svg);
  const image = resvg.render();
  const pixels = image.pixels.slice();
  image.free();
  resvg.free();
  return pixels;
}

beforeAll(async () => {
  const response = await fetch(resvgUrl);
  await initWasm(await response.arrayBuffer());
});

test.each(lossyJpegs.map((jpeg) => [jpeg.name, jpeg] as const))(
  "Chromium and resvg draw %s within the pinned channel tolerance, every pixel",
  async (_name, jpeg) => {
    const { width, height } = size(jpeg.uri);
    const svg = svgOf(jpeg.uri, width, height);
    const chromium = await chromiumPixels(svg, width, height);
    const resvg = resvgPixels(svg);
    expect(resvg.length).toBe(width * height * 4);
    let largest = 0;
    for (let index = 0; index < resvg.length; index++) {
      largest = Math.max(largest, Math.abs((chromium[index] ?? 0) - (resvg[index] ?? 0)));
    }
    expect(largest).toBe(jpeg.measuredMax);
    expect(largest).toBeLessThanOrEqual(jpegChannelTolerance);
  },
);

test("the tolerance is the largest measured difference, no looser", () => {
  expect(Math.max(...lossyJpegs.map((jpeg) => jpeg.measuredMax))).toBe(jpegChannelTolerance);
});
