import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { defineGoldenSuite } from "../src/GoldenSuite.js";
import { GoldenStore } from "../src/node/GoldenStore.js";
import { checkBrowserRender } from "../src/node/checkBrowserRender.js";
import { checkNodeFixture } from "../src/node/checkNodeFixture.js";
import { rasterizeSvg } from "../src/node/rasterizeSvg.js";

const open = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">';
const red = `${open}<rect width="16" height="16" fill="#ff0000"/></svg>`;
const blue = `${open}<rect width="16" height="16" fill="#0000ff"/></svg>`;

const suite = defineGoldenSuite<string>({
  name: "temp",
  render: (svg) => svg,
  fixtures: [{ name: "box", input: red }],
});
const box = suite.fixtures[0] as (typeof suite.fixtures)[number];

let dir: string;
let store: GoldenStore;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "readmint-golden-"));
  store = new GoldenStore(join(dir, "golden"), join(dir, "results"));
  await checkNodeFixture(suite, box, store, "update");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("checkBrowserRender", () => {
  test("identical SVG and a matching raster pass", () => {
    const result = checkBrowserRender(suite, box, store, red, { svg: red, png: rasterizeSvg(red) });
    expect(result).toEqual({ problems: [], artefacts: [] });
  });

  test("a raw SVG that differs by one byte fails and writes node.svg and browser.svg", () => {
    const result = checkBrowserRender(suite, box, store, red, {
      svg: `${red}\n`,
      png: rasterizeSvg(red),
    });
    expect(result.problems).toEqual(["box: browser SVG differs from the Node SVG"]);
    expect(existsSync(store.artefactPath("box", "node.svg"))).toBe(true);
    expect(existsSync(store.artefactPath("box", "browser.svg"))).toBe(true);
  });

  test("a raster beyond the browser tolerance fails with browser.png and browser-diff.png", () => {
    const result = checkBrowserRender(suite, box, store, red, {
      svg: red,
      png: rasterizeSvg(blue),
    });
    expect(result.problems[0]).toContain("browser raster differs");
    expect(existsSync(store.artefactPath("box", "browser.png"))).toBe(true);
    expect(existsSync(store.artefactPath("box", "browser-diff.png"))).toBe(true);
  });

  test("a raster within the browser tolerance passes", () => {
    const lenient = { ...suite, browserTolerance: { maxDiffRatio: 1 } };
    expect(
      checkBrowserRender(lenient, box, store, red, { svg: red, png: rasterizeSvg(blue) }).problems,
    ).toEqual([]);
  });

  test("a missing golden fails and is never created", () => {
    rmSync(store.pngPath("box"));
    const result = checkBrowserRender(suite, box, store, red, { svg: red, png: rasterizeSvg(red) });
    expect(result.problems[0]).toContain("pnpm golden:update temp");
    expect(existsSync(store.pngPath("box"))).toBe(false);
  });
});
