import { PNG } from "pngjs";
import { beforeAll, describe, expect, test } from "vitest";
import { OutputBudget } from "../src/OutputBudget.js";
import { encodeWebp } from "../src/encodeWebp.js";
import { exportRaster, RasterError } from "../src/index.js";
import { rasterCodecs } from "../src/initRaster.js";
import { riffWebp, webpChunks, writeU24le } from "../src/webpChunks.js";
import { decodeApng, pngOf } from "./decodeRaster.js";
import { dataUri, designInput, imageDesign, patternPng, patternWebp } from "./rasterFixtures.js";

const pattern = PNG.sync.read(Buffer.from(patternPng));
const patternPixels = new Uint8Array(pattern.data);

async function pixelsOf(src: string): Promise<Uint8Array> {
  const output = await exportRaster(designInput(imageDesign(src)), { format: "png", scale: 2 });
  return decodeApng(output.bytes).frames[0]?.pixels ?? new Uint8Array();
}

function svgWithImage(src: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16"><image width="24" height="16" href="${src}"/></svg>`;
}

beforeAll(async () => {
  await rasterCodecs();
});

describe("WebP image assets", () => {
  test("a still WebP draws exactly like its PNG twin", async () => {
    const webp = await pixelsOf(dataUri("image/webp", await patternWebp()));
    expect(Buffer.from(webp).equals(await pixelsOf(dataUri("image/png", patternPng)))).toBe(true);
  });

  test("an animated WebP draws its first frame", async () => {
    const codecs = await rasterCodecs();
    const encoder = encodeWebp(
      pattern.width,
      pattern.height,
      true,
      codecs,
      new OutputBudget(1e9, "WebP"),
    );
    encoder.add(patternPixels, 100);
    encoder.add(
      patternPixels.map((byte, index) => (index % 4 === 3 ? byte : 255 - byte)),
      100,
    );
    const animated = encoder.finish();
    const webp = await pixelsOf(dataUri("image/webp", animated));
    expect(Buffer.from(webp).equals(await pixelsOf(dataUri("image/png", patternPng)))).toBe(true);
  });

  test("an animated WebP whose first frame is smaller than the canvas draws it in place", async () => {
    const codecs = await rasterCodecs();
    const small = new Uint8Array(4 * 6 * 4).fill(200);
    const frame = webpChunks(codecs.encodeWebp({ data: small, width: 4, height: 6 })).find(
      (chunk) => chunk.type === "VP8L",
    );
    if (frame === undefined) throw new Error("libwebp wrote no VP8L chunk");
    const header = new Uint8Array(10);
    header[0] = 0x12;
    writeU24le(header, 4, 24 - 1);
    writeU24le(header, 7, 16 - 1);
    const anmf = new Uint8Array(16 + 8 + frame.data.length + (frame.data.length & 1));
    writeU24le(anmf, 0, 1);
    writeU24le(anmf, 3, 2);
    writeU24le(anmf, 6, 4 - 1);
    writeU24le(anmf, 9, 6 - 1);
    writeU24le(anmf, 12, 100);
    anmf[15] = 0x02;
    anmf.set(riffWebp([frame]).subarray(12), 16);
    const animated = riffWebp([
      { type: "VP8X", data: header },
      { type: "ANIM", data: new Uint8Array(6) },
      { type: "ANMF", data: anmf },
    ]);
    const twin = new Uint8Array(24 * 16 * 4);
    for (let row = 0; row < 6; row++)
      twin.fill(200, ((4 + row) * 24 + 2) * 4, ((4 + row) * 24 + 6) * 4);
    const webp = await pixelsOf(dataUri("image/webp", animated));
    expect(
      Buffer.from(webp).equals(await pixelsOf(dataUri("image/png", pngOf(twin, 24, 16)))),
    ).toBe(true);
  });

  test("a malformed WebP is a raster-image error, never a crash", async () => {
    const valid = await patternWebp();
    const broken = [
      valid.subarray(0, 20),
      Uint8Array.from([...valid.subarray(0, 12), 0x56, 0x50, 0x38, 0x4c, 0xff, 0xff, 0xff, 0x7f]),
      valid.map((byte, index) => (index >= 21 ? byte ^ 0x5a : byte)),
    ];
    for (const bytes of broken) {
      const input = { frame: () => svgWithImage(dataUri("image/webp", bytes)) };
      const failure = exportRaster(input, { format: "png" });
      await expect(failure).rejects.toBeInstanceOf(RasterError);
      await expect(failure).rejects.toMatchObject({ code: "raster-image" });
    }
  });
});
