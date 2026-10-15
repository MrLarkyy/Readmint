import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Design } from "@readmint/format";
import { expect, test } from "vitest";
import { exportRaster, RasterLimits, type RasterFormat } from "../src/index.js";
import {
  designInput,
  fontBytes,
  dataUri,
  loopDesign,
  onceDesign,
  photoDesign,
  shapesDesign,
  textDesign,
} from "./rasterFixtures.js";

const reportDir = join(import.meta.dirname, "..", "..", "..", "test-results", "raster");

/** A README-sized card (420 x 120) with text and a 1.5 s animation: what a real export weighs. */
const cardDesign: Design = {
  version: 0,
  canvas: { width: 420, height: 120, background: "#ffffff" },
  assets: {
    fonts: {
      medium: {
        family: "Montserrat",
        src: dataUri("font/ttf", fontBytes),
        weight: 500,
        licence: { embedding: "allowed", name: "OFL-1.1" },
      },
    },
  },
  animation: { duration: 1500 },
  layers: [
    { type: "rect", x: 8, y: 8, width: 404, height: 104, radius: 12, fill: "#f6f8fa" },
    {
      type: "text",
      x: 24,
      y: 24,
      content: "Readmint",
      font: "medium",
      fontSize: 32,
      fill: "#1f2328",
    },
    {
      type: "rect",
      x: 24,
      y: 80,
      width: 120,
      height: 12,
      radius: 6,
      fill: "#1a7f37",
      animate: {
        scale: {
          keyframes: [
            { offset: 0, value: 0.2 },
            { offset: 1, value: 1 },
          ],
        },
      },
    },
  ],
};

const fixtures: readonly [string, Design][] = [
  ["shapes", shapesDesign],
  ["text", textDesign],
  ["loop", loopDesign],
  ["once", onceDesign],
  ["card", cardDesign],
  ["photo", photoDesign],
];

const formats: readonly RasterFormat[] = ["png", "webp", "apng", "gif"];

test("every fixture in every format stays under the output limit; the report lists the bytes", async () => {
  const rows: string[] = [];
  for (const [name, design] of fixtures) {
    const cells: string[] = [];
    for (const format of formats) {
      const output = await exportRaster(designInput(design), { format });
      expect(output.bytes.length, `${name} ${format}`).toBeLessThanOrEqual(
        RasterLimits.maxOutputBytes,
      );
      cells.push(`${String(output.bytes.length)} (${String(output.frames)} fr)`);
    }
    const lossy = await exportRaster(designInput(design), { format: "webp", quality: 75 });
    expect(lossy.bytes.length, `${name} webp q75`).toBeLessThanOrEqual(RasterLimits.maxOutputBytes);
    cells.push(`${String(lossy.bytes.length)} (${String(lossy.frames)} fr)`);
    if (name === "photo") {
      const lossless = await exportRaster(designInput(design), { format: "webp" });
      expect(lossy.bytes.length).toBeLessThan(lossless.bytes.length);
    }
    rows.push(`| ${name} | ${cells.join(" | ")} |`);
  }
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    join(reportDir, "size-report.md"),
    [
      "# Raster size report",
      "",
      `Bytes per fixture and format at the default scale (2) and frame rate (30, GIF 25); limit ${String(RasterLimits.maxOutputBytes)}.`,
      "",
      `| fixture | ${[...formats, "webp q75"].join(" | ")} |`,
      `|---|${[...formats, "webp q75"].map(() => "---").join("|")}|`,
      ...rows,
      "",
    ].join("\n"),
  );
});
