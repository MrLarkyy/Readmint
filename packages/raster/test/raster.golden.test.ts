import type { Design } from "@readmint/format";
import { defaultNodeTolerance, type GoldenTolerance } from "@readmint/golden";
import { comparePng, GoldenStore, goldenMode, rasterizeSvg } from "@readmint/golden/node";
import { renderSvg } from "@readmint/renderer";
import { beforeAll, describe, expect, test } from "vitest";
import { exportRaster, type RasterFormat } from "../src/index.js";
import {
  decodeApng,
  decodeGif,
  decodePng,
  type DecodedRaster,
  decodeWebp,
  frameSheet,
  pngOf,
} from "./decodeRaster.js";
import {
  dataUri,
  designInput,
  fontPath,
  imageDesign,
  loopDesign,
  onceDesign,
  patternPng,
  patternWebp,
  shapesDesign,
  textDesign,
} from "./rasterFixtures.js";

interface RasterFixture {
  readonly name: string;
  readonly design: () => Design;
  /** The design resvg-js draws as the reference; default the same design. */
  readonly reference?: () => Design;
  readonly formats: readonly RasterFormat[];
}

const scale = 2;
const frameRate = 10;
/** GIF has 256 colours a frame: the palette may move a colour slightly, never far, on a few pixels. */
const gifTolerance: GoldenTolerance = {
  threshold: 0.15,
  maxDiffRatio: 0.01,
  includeAA: false,
  maxTileInk: 1,
};

let webpSrc = "";
const pngSrc = dataUri("image/png", patternPng);

const fixtures: readonly RasterFixture[] = [
  { name: "shapes", design: () => shapesDesign, formats: ["png", "webp", "gif"] },
  { name: "text", design: () => textDesign, formats: ["png", "webp", "gif"] },
  { name: "image-png", design: () => imageDesign(pngSrc), formats: ["png"] },
  {
    name: "image-webp",
    design: () => imageDesign(webpSrc),
    // resvg cannot draw WebP: the same pixels as a PNG are what the WebP image must look like.
    reference: () => imageDesign(pngSrc),
    formats: ["png", "webp"],
  },
  { name: "loop", design: () => loopDesign, formats: ["apng", "webp", "gif"] },
  { name: "once", design: () => onceDesign, formats: ["apng", "webp", "gif"] },
];

const store = GoldenStore.forSuiteFile(import.meta.url);
const mode = goldenMode();

beforeAll(async () => {
  webpSrc = dataUri("image/webp", await patternWebp());
});

async function decode(format: RasterFormat, bytes: Uint8Array): Promise<DecodedRaster> {
  if (format === "webp") return decodeWebp(bytes);
  if (format === "gif") return decodeGif(bytes);
  return decodeApng(bytes);
}

/** GIF's 1-bit alpha applied to a reference: below half transparent, else opaque in its own colour. */
function oneBitAlpha(pixels: Uint8Array): Uint8Array {
  const out = pixels.slice();
  for (let index = 0; index < out.length; index += 4) {
    const opaque = (out[index + 3] ?? 0) >= 128;
    if (opaque) out[index + 3] = 255;
    else out.fill(0, index, index + 4);
  }
  return out;
}

/** resvg-js (the golden rasterizer) drawing the renderer's SVG at `time`. */
function reference(design: Design, time: number | undefined): Uint8Array {
  const result = renderSvg(design, time === undefined ? {} : { time });
  if (!result.ok) throw new Error("reference design does not render");
  return decodePng(rasterizeSvg(result.svg, scale, [fontPath]));
}

describe("golden raster", () => {
  for (const fixture of fixtures) {
    for (const format of fixture.formats) {
      const name = `${fixture.name}-${format}`;
      test(name, async () => {
        const design = fixture.design();
        const output = await exportRaster(designInput(design), { format, scale, frameRate });
        const raster = await decode(format, output.bytes);
        expect([raster.width, raster.height]).toEqual([output.width, output.height]);
        const tolerance = format === "gif" ? gifTolerance : defaultNodeTolerance;
        const animated = design.animation !== undefined;
        let start = 0;
        for (const [index, frame] of raster.frames.entries()) {
          const expected = reference(fixture.reference?.() ?? design, animated ? start : undefined);
          const comparison = comparePng(
            pngOf(format === "gif" ? oneBitAlpha(expected) : expected, raster.width, raster.height),
            pngOf(frame.pixels, raster.width, raster.height),
            tolerance,
          );
          expect(
            comparison.pass,
            `${name} frame ${String(index)} at ${String(start)} ms: ${String(comparison.diffPixels)} pixels differ ${comparison.reason ?? ""}`,
          ).toBe(true);
          start += frame.delay * (format === "gif" ? 10 : 1);
        }
        const sheet = frameSheet(raster);
        const path = store.pngPath(name);
        const golden = store.read(path);
        const check = golden === undefined ? undefined : comparePng(golden, sheet, tolerance);
        if (check?.pass === true) return;
        if (mode === "update") {
          store.writeIfChanged(path, sheet);
          return;
        }
        store.writeArtefact(name, "actual.png", sheet);
        if (check?.diffPng !== undefined) store.writeArtefact(name, "diff.png", check.diffPng);
        expect.fail(
          golden === undefined
            ? `missing golden ${path}; run pnpm golden:update raster`
            : `${name} differs from golden ${path} (${check?.reason ?? `${String(check?.diffPixels)} pixels`})`,
        );
      });
    }
  }

  test("no orphan goldens", () => {
    const names = fixtures.flatMap((fixture) =>
      fixture.formats.map((format) => `${fixture.name}-${format}`),
    );
    if (mode === "update") {
      store.removeOrphans(names);
      return;
    }
    expect(store.orphans(names)).toEqual([]);
  });
});
