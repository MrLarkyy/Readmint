import { readFileSync } from "node:fs";
import { defaultNodeTolerance } from "@readmint/golden";
import { comparePng, rasterizeSvg } from "@readmint/golden/node";
import { describe, expect, test } from "vitest";
import { matchFontFamilies } from "../../raster/src/matchFontFamilies.js";
import { rasterFonts } from "../../raster/src/rasterFonts.js";
import { embeddedFonts } from "../../renderer/test/embeddedFonts.js";
import { loadExampleProfile, renderProfile } from "./profileDesigns.js";
import { sampleProfileData } from "./sampleProfileData.js";

const golden = readFileSync(new URL("./golden/profiles-year-ring/year-light.png", import.meta.url));

const svg = renderProfile({
  template: "year-ring",
  design: loadExampleProfile("year-ring", "year", "light"),
  data: sampleProfileData(),
  time: 0,
});

function raster(source: string): Uint8Array {
  const copy = matchFontFamilies(source, rasterFonts(source));
  return rasterizeSvg(copy, 1, [], embeddedFonts(source));
}

/** The back month labels are 10 px text on the ring; the front row is 11 px and not matched. */
function withoutLabel(month: string): string {
  const label = new RegExp(
    `<text [^>]*font-size="10"[^>]*><tspan [^>]*>${month}</tspan></text>`,
    "g",
  );
  expect(svg.match(label)).toHaveLength(1);
  return svg.replace(label, "");
}

describe("a dropped small month label in the Year Ring year", () => {
  test("the unmodified design matches the committed PNG", () => {
    expect(comparePng(golden, raster(svg), defaultNodeTolerance).pass).toBe(true);
  });

  test("the faint JAN label (10 px, opacity 0.13) fails the ink check only", () => {
    const dropped = raster(withoutLabel("JAN"));
    const result = comparePng(golden, dropped, defaultNodeTolerance);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("ink");
    expect(comparePng(golden, dropped, { ...defaultNodeTolerance, maxTileInk: 1 }).pass).toBe(true);
  });

  test("the opaque OCT label fails on pixels alone", () => {
    const result = comparePng(golden, raster(withoutLabel("OCT")), {
      ...defaultNodeTolerance,
      maxTileInk: 1,
    });
    expect(result.pass).toBe(false);
    expect(result.diffPixels).toBeGreaterThan(0);
  });
});
