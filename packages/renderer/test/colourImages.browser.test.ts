import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { colourDesign, colourImages, swatchDeviation } from "./colourImages.js";

/** The RGBA pixels Chromium draws of a 32x16 SVG, through a canvas. */
async function chromiumPixels(svg: string): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no 2d canvas");
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, 32, 16).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rendered(uri: string): string {
  const result = renderSvg(colourDesign(uri), {});
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

/** The image as it was uploaded, drawn by Chromium without the renderer. */
function original(uri: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><image width="32" height="16" href="${uri}"/></svg>`;
}

const rows = (applies: boolean) =>
  colourImages
    .filter((row) => row.chromiumApplies === applies)
    .map((row) => [row.name, row] as const);

describe("embedded colour data", () => {
  test.each(colourImages.map((row) => [row.name, row] as const))(
    "Chromium draws the rendered %s at its stored colours, as resvg does",
    async (_name, row) => {
      expect(swatchDeviation(await chromiumPixels(rendered(row.uri)))).toBeLessThanOrEqual(
        row.tolerance,
      );
    },
  );

  test.each(rows(true))(
    "Chromium colour-manages the uploaded %s off its stored colours, which resvg ignores",
    async (_name, row) => {
      expect(swatchDeviation(await chromiumPixels(original(row.uri)))).toBeGreaterThan(20);
    },
  );

  test.each(rows(false))(
    "Chromium draws the uploaded %s at its stored colours already",
    async (_name, row) => {
      expect(swatchDeviation(await chromiumPixels(original(row.uri)))).toBeLessThanOrEqual(
        row.tolerance,
      );
    },
  );
});
