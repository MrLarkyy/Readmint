import { readFile } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import { exportRaster as browserExport, initRaster as browserInit } from "../src/browser.js";
import { exportRaster as nodeExport } from "../src/index.js";
import { resetRasterRuntime } from "../src/rasterRuntime.js";
import { resolveRasterWasm } from "../src/RasterWasm.js";
import type { RasterFormat } from "../src/RasterFormat.js";
import { designInput, loopDesign, shapesDesign, textDesign } from "./rasterFixtures.js";

afterEach(() => {
  resetRasterRuntime();
});

const formats: readonly RasterFormat[] = ["png", "webp", "apng", "gif"];
const designs = { shapes: shapesDesign, text: textDesign, loop: loopDesign };

test("exportRaster before initRaster names the missing step", async () => {
  await expect(browserExport(designInput(shapesDesign), { format: "png" })).rejects.toThrow(
    "raster modules are not loaded; call initRaster first",
  );
});

test("the browser entry, given the wasm bytes, makes the Node entry's bytes", async () => {
  const paths = resolveRasterWasm();
  const modules = {
    resvg: await readFile(paths.resvg),
    webp: await readFile(paths.webp),
  };
  for (const [name, design] of Object.entries(designs)) {
    for (const format of formats) {
      if (name !== "loop" && (format === "apng" || format === "gif")) continue;
      resetRasterRuntime();
      await browserInit(modules);
      const fromBytes = await browserExport(designInput(design), { format, frameRate: 10 });
      resetRasterRuntime();
      const fromDisk = await nodeExport(designInput(design), { format, frameRate: 10 });
      expect(Buffer.from(fromBytes.bytes).equals(fromDisk.bytes), `${name} ${format}`).toBe(true);
    }
  }
});

test("a failed load can be retried", async () => {
  const paths = resolveRasterWasm();
  await expect(
    browserInit({ resvg: new Uint8Array(4), webp: new Uint8Array(4) }),
  ).rejects.toThrow();
  await browserInit({ resvg: await readFile(paths.resvg), webp: await readFile(paths.webp) });
  const output = await browserExport(designInput(shapesDesign), { format: "png" });
  expect(output.bytes.length).toBeGreaterThan(0);
});
