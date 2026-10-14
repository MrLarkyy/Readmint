import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
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

test("node failure artefacts survive a passing browser check, and the other way round", async () => {
  const changed = { ...box, input: blue };
  await checkNodeFixture({ ...suite, fixtures: [changed] }, changed, store, "check");
  checkBrowserRender(suite, box, store, red, { svg: red, png: rasterizeSvg(red) });
  for (const kind of ["actual.svg", "actual.png", "diff.png"] as const) {
    expect(existsSync(store.artefactPath("box", kind)), kind).toBe(true);
  }

  checkBrowserRender(suite, box, store, red, { svg: `${red}\n`, png: rasterizeSvg(blue) });
  await checkNodeFixture(suite, box, store, "check");
  for (const kind of ["node.svg", "browser.svg", "browser.png", "browser-diff.png"] as const) {
    expect(existsSync(store.artefactPath("box", kind)), kind).toBe(true);
  }
  expect(existsSync(store.artefactPath("box", "diff.png"))).toBe(false);
});

test("text without suite fonts is refused with a clear message", () => {
  const text = `${open}<text x="1" y="10">Hi</text></svg>`;
  expect(() => rasterizeSvg(text)).toThrow(/text but the suite supplies no fonts/);
});

test("a rendered PNG over the size cap is a problem in both modes and nothing is written", async () => {
  const wide = {
    ...box,
    scale: 4,
    input:
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="9" height="9"/></svg>',
  };
  const big = { ...suite, fixtures: [wide] };
  for (const mode of ["check", "update"] as const) {
    const result = await checkNodeFixture(big, wide, store, mode);
    expect(result.problems.join("\n")).toContain("4800x1600");
  }
  expect(existsSync(store.pngPath("box"))).toBe(true);
  expect(existsSync(join(store.goldenDir, "wide.png"))).toBe(false);
});

test("a corrupt golden PNG fails naming the file and writes the actual image", async () => {
  const header = rasterizeSvg(red).subarray(0, 40);
  writeFileSync(store.pngPath("box"), header);
  const result = await checkNodeFixture(suite, box, store, "check");
  expect(result.problems.join("\n")).toContain(store.pngPath("box"));
  expect(result.problems.join("\n")).toContain("corrupt");
  expect(existsSync(store.artefactPath("box", "actual.png"))).toBe(true);
});

test("results of the golden package use a single golden segment", () => {
  const own = GoldenStore.forSuiteFile(join(import.meta.dirname, "self.golden.ts"), "/r");
  expect(own.resultsDir.replaceAll("\\", "/")).toBe("/r/self");
});
