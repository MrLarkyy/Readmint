import type { Design } from "@readmint/format";
import { defaultNodeTolerance } from "@readmint/golden";
import { comparePng, rasterizeSvg } from "@readmint/golden/node";
import { renderSvg } from "@readmint/renderer";
import { beforeAll, describe, expect, test } from "vitest";
import animation from "../../renderer/test/renderer-animation.golden.js";
import layout from "../../renderer/test/renderer-layout.golden.js";
import { exportRaster, RasterError } from "../src/index.js";
import { initRaster } from "../src/initRaster.js";
import { rasterizeFrame } from "../src/rasterizeFrame.js";
import { decodeApng, decodePng, pngOf } from "./decodeRaster.js";
import { designInput } from "./rasterFixtures.js";

function fixtureDesign(
  suite: {
    readonly fixtures: readonly {
      readonly name: string;
      readonly input: { readonly design: Design };
    }[];
  },
  name: string,
): Design {
  const fixture = suite.fixtures.find((candidate) => candidate.name === name);
  if (fixture === undefined) throw new Error(`no fixture ${name}`);
  return fixture.input.design;
}

/** Layers of their own far off the canvas, which the renderer leaves out. */
const offCanvas = fixtureDesign(layout, "off-canvas-layers");
/** A rect with opacity sliding in from four canvas widths away. */
const slideIn = fixtureDesign(animation, "off-canvas-slide-in-t0");

/** A clip group beyond twice the canvas, written by hand: resvg 2.6.2 traps on it. */
const trapSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="50" height="50"/></clipPath></defs><g transform="translate(0 300)" clip-path="url(#c)"><rect width="50" height="50" fill="red"/></g></svg>';
const plainSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="50" height="50"/></clipPath></defs><g transform="translate(0 80)" clip-path="url(#c)"><rect width="50" height="50" fill="red"/></g></svg>';

beforeAll(async () => {
  await initRaster();
});

/** Exports `offCanvas` as a PNG and checks it against the golden rasterizer's drawing of the renderer's SVG. */
async function expectOffCanvasPng(): Promise<void> {
  const output = await exportRaster(designInput(offCanvas), { format: "png", scale: 2 });
  const rendered = renderSvg(offCanvas);
  if (!rendered.ok) throw new Error("the design does not render");
  const expected = decodePng(rasterizeSvg(rendered.svg, 2));
  const actual = decodePng(output.bytes);
  const comparison = comparePng(
    pngOf(expected, output.width, output.height),
    pngOf(actual, output.width, output.height),
    defaultNodeTolerance,
  );
  expect([output.width, output.height]).toEqual([320, 200]);
  expect(comparison.pass, `${String(comparison.diffPixels)} pixels differ`).toBe(true);
}

/**
 * A group turned about its centre with a child far from it: the trig-free bounds of the turn reach the canvas, so
 * the renderer keeps the layer, and resvg traps on it (never give this to the golden rasterizer).
 */
const turnedFar: Design = {
  version: 0,
  canvas: { width: 100, height: 100 },
  layers: [
    { type: "rect", x: 10, y: 10, width: 10, height: 10, fill: "#0969da" },
    {
      type: "group",
      width: 100,
      height: 100,
      rotation: 45,
      opacity: 0.5,
      children: [{ type: "rect", x: 500, y: 500, width: 10, height: 10, fill: "#c00001" }],
    },
  ],
};

describe("a design with layers far off the canvas exports", () => {
  test("as a PNG with the golden rasterizer's pixels", async () => {
    await expectOffCanvasPng();
  });

  test("or, for a layer the renderer keeps, refuses with raster-image; the next export draws", async () => {
    const rendered = renderSvg(turnedFar);
    expect(rendered.ok && rendered.svg.includes("#c00001")).toBe(true);
    await expect(exportRaster(designInput(turnedFar), { format: "png" })).rejects.toMatchObject({
      name: "RasterError",
      code: "raster-image",
    });
    await expectOffCanvasPng();
  });

  test("as an APNG while an animated layer slides in from beyond twice the canvas", async () => {
    const output = await exportRaster(designInput(slideIn), {
      format: "apng",
      scale: 1,
      frameRate: 10,
    });
    const raster = decodeApng(output.bytes);
    expect(raster.frames.length).toBeGreaterThan(1);
  });
});

describe("rasterizeFrame on an SVG resvg cannot draw", () => {
  test("throws RasterError raster-image, and the next SVG draws as before", () => {
    const before = rasterizeFrame(plainSvg, 1, []);
    let error: unknown;
    try {
      rasterizeFrame(trapSvg, 1, []);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RasterError);
    expect((error as RasterError).code).toBe("raster-image");
    expect((error as RasterError).message).toMatch(/resvg stopped drawing the SVG/u);
    const after = rasterizeFrame(plainSvg, 1, []);
    expect([after.width, after.height]).toEqual([before.width, before.height]);
    expect(Buffer.from(after.data).equals(Buffer.from(before.data))).toBe(true);
  });

  test("exportRaster of such a frame rejects with RasterError raster-image", async () => {
    await expect(exportRaster({ frame: () => trapSvg }, { format: "png" })).rejects.toMatchObject({
      name: "RasterError",
      code: "raster-image",
    });
  });
});
