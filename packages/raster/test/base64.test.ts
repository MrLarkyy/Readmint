import { expect, test } from "vitest";
import { decodeBase64, encodeBase64 } from "../src/base64.js";
import { countImagePixels } from "../src/countImagePixels.js";
import { inlineWebpAssets } from "../src/inlineWebpAssets.js";
import { RasterError } from "../src/RasterError.js";
import { rasterFonts } from "../src/rasterFonts.js";

function bytesOfLength(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, at) => (at * 37 + length * 11) % 256);
}

test("encodeBase64 matches Buffer for every length up to 300", () => {
  for (let length = 0; length <= 300; length++) {
    const bytes = bytesOfLength(length);
    expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  }
});

test("encodeBase64 handles input larger than one chunk", () => {
  const bytes = bytesOfLength(0x8000 * 2 + 5);
  expect(encodeBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
});

test("decodeBase64 matches Buffer on valid input", () => {
  for (let length = 0; length <= 300; length++) {
    const bytes = bytesOfLength(length);
    const decoded = decodeBase64(Buffer.from(bytes).toString("base64"));
    expect(decoded && [...decoded]).toEqual([...bytes]);
  }
});

test.each(["A", "AAA", "AA=A", "AAAA=", "AA==AA==", "A A A", "AA-_", "AAA\n", "====", "AB==x"])(
  "decodeBase64 refuses %j",
  (text) => {
    expect(decodeBase64(text)).toBeUndefined();
  },
);

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof RasterError ? error.code : "other";
  }
  return undefined;
}

test("malformed base64 in an image data URI is a raster-image error", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAA"/></svg>';
  expect(codeOf(() => countImagePixels(svg, 1))).toBe("raster-image");
});

test("malformed base64 in a WebP data URI is a raster-image error", () => {
  const svg = '<svg><image href="data:image/webp;base64,AAA"/></svg>';
  const codec = { encodeWebp: () => new Uint8Array(), decodeWebp: () => undefined };
  expect(codeOf(() => inlineWebpAssets(svg, codec, new Map()))).toBe("raster-image");
});

test("malformed base64 in an embedded font is a raster-font error", () => {
  const svg =
    "<svg><style>@font-face{font-family:A;src:url(data:font/ttf;base64,AA=A) format('truetype')}</style></svg>";
  expect(codeOf(() => rasterFonts(svg))).toBe("raster-font");
});
