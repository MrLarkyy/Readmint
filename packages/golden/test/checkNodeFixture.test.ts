import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { defineGoldenSuite } from "../src/GoldenSuite.js";
import { GoldenStore } from "../src/node/GoldenStore.js";
import { checkNodeFixture, checkOrphans } from "../src/node/checkNodeFixture.js";
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

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "readmint-golden-"));
  store = new GoldenStore(join(dir, "golden"), join(dir, "results"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("checkNodeFixture", () => {
  test("a missing golden fails in check mode, names the update command and writes nothing", async () => {
    const result = await checkNodeFixture(suite, box, store, "check");
    expect(result.problems).toHaveLength(2);
    expect(result.problems.join("\n")).toContain("pnpm golden:update temp");
    expect(existsSync(store.svgPath("box"))).toBe(false);
    expect(existsSync(store.pngPath("box"))).toBe(false);
  });

  test("update mode writes the missing goldens and the next check passes", async () => {
    const written = await checkNodeFixture(suite, box, store, "update");
    expect(written.problems).toEqual([]);
    expect(existsSync(store.svgPath("box"))).toBe(true);
    expect(existsSync(store.pngPath("box"))).toBe(true);
    expect((await checkNodeFixture(suite, box, store, "check")).problems).toEqual([]);
  });

  test("a changed render fails with actual and diff artefacts", async () => {
    await checkNodeFixture(suite, box, store, "update");
    const changed = { ...box, input: blue };
    const result = await checkNodeFixture(
      { ...suite, fixtures: [changed] },
      changed,
      store,
      "check",
    );
    expect(result.problems.some((problem) => problem.includes("SVG differs"))).toBe(true);
    expect(result.problems.some((problem) => problem.includes("PNG differs"))).toBe(true);
    for (const kind of ["actual.svg", "actual.png", "diff.png"] as const) {
      expect(existsSync(store.artefactPath("box", kind)), kind).toBe(true);
    }
  });

  test("a passing check clears stale artefacts", async () => {
    await checkNodeFixture(suite, box, store, "update");
    const changed = { ...box, input: blue };
    await checkNodeFixture({ ...suite, fixtures: [changed] }, changed, store, "check");
    expect((await checkNodeFixture(suite, box, store, "check")).problems).toEqual([]);
    expect(existsSync(store.artefactPath("box", "actual.png"))).toBe(false);
    expect(existsSync(store.artefactPath("box", "diff.png"))).toBe(false);
    expect(existsSync(store.artefactPath("box", "actual.svg"))).toBe(false);
  });

  test("snapshot drift without a visible change still fails on the SVG", async () => {
    await checkNodeFixture(suite, box, store, "update");
    const drifted = {
      ...box,
      input: `${open}<g/><rect width="16" height="16" fill="#ff0000"/></svg>`,
    };
    const result = await checkNodeFixture(
      { ...suite, fixtures: [drifted] },
      drifted,
      store,
      "check",
    );
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("SVG differs");
    expect(readFileSync(store.artefactPath("box", "actual.svg"), "utf8")).toContain("<g/>");
  });

  test("a render that differs between two runs fails as non-deterministic", async () => {
    let calls = 0;
    const flaky = { ...suite, render: () => (calls++ % 2 === 0 ? red : blue) };
    const result = await checkNodeFixture(flaky, box, store, "update");
    expect(result.problems[0]).toContain("not deterministic");
    expect(existsSync(store.svgPath("box"))).toBe(false);
  });

  test("update mode leaves a golden within tolerance byte-identical", async () => {
    await checkNodeFixture(suite, box, store, "update");
    const old = new Date("2001-01-01T00:00:00Z");
    utimesSync(store.pngPath("box"), old, old);
    const withinTolerance = { ...suite, tolerance: { maxDiffRatio: 1, maxTileInk: 1 } };
    const changed = { ...box, input: blue };
    const before = readFileSync(store.pngPath("box"));
    const result = await checkNodeFixture(
      { ...withinTolerance, fixtures: [changed] },
      changed,
      store,
      "update",
    );
    expect(result.problems).toEqual([]);
    expect(readFileSync(store.pngPath("box")).equals(before)).toBe(true);
    expect(statSync(store.pngPath("box")).mtime).toEqual(old);
  });

  test("update mode overwrites a golden beyond tolerance", async () => {
    await checkNodeFixture(suite, box, store, "update");
    const before = readFileSync(store.pngPath("box"));
    const changed = { ...box, input: blue };
    await checkNodeFixture({ ...suite, fixtures: [changed] }, changed, store, "update");
    expect(readFileSync(store.pngPath("box")).equals(before)).toBe(false);
  });

  test("a PNG golden of another size fails with the sizes in the message", async () => {
    await checkNodeFixture(suite, box, store, "update");
    const scaled = { ...box, scale: 2 };
    const result = await checkNodeFixture({ ...suite, fixtures: [scaled] }, scaled, store, "check");
    expect(result.problems.join("\n")).toContain("32x32");
  });
});

describe("checkOrphans", () => {
  test("check mode reports golden files no fixture owns, update mode removes them", async () => {
    await checkNodeFixture(suite, box, store, "update");
    writeFileSync(join(store.goldenDir, "gone.png"), "x");
    writeFileSync(join(store.goldenDir, "gone.svg"), "x");
    const reported = checkOrphans(suite, store, "check");
    expect(reported.problems).toHaveLength(2);
    expect(reported.problems[0]).toContain("pnpm golden:update temp");
    expect(existsSync(join(store.goldenDir, "gone.png"))).toBe(true);

    const removed = checkOrphans(suite, store, "update");
    expect(removed.problems).toEqual([]);
    expect(existsSync(join(store.goldenDir, "gone.png"))).toBe(false);
    expect(existsSync(store.pngPath("box"))).toBe(true);
    expect(checkOrphans(suite, store, "check").problems).toEqual([]);
  });
});

describe("GoldenStore", () => {
  test("refuses fixture names that could leave the suite directory", () => {
    expect(() => store.pngPath("../escape")).toThrow(/invalid/);
    expect(() => store.artefactPath("a/b", "diff.png")).toThrow(/invalid/);
  });
});

test("a suite with fontsFromSvg gives resvg the fonts it finds in each rendered SVG", async () => {
  const font = new Uint8Array(
    readFileSync(
      join(import.meta.dirname, "..", "..", "renderer", "test", "fonts", "ReadmintTestSymbols.ttf"),
    ),
  );
  const text = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><text x="2" y="16" font-family="Readmint Test Symbols" font-size="16">\u2605</text></svg>`;
  const seen: string[] = [];
  const withFonts = defineGoldenSuite<string>({
    name: "temp",
    render: (svg) => svg,
    fontsFromSvg: (svg) => {
      seen.push(svg);
      return [font];
    },
    fixtures: [{ name: "star", input: text }],
  });
  const [star] = withFonts.fixtures;
  if (star === undefined) throw new Error("fixture");
  const dir = mkdtempSync(join(tmpdir(), "readmint-golden-"));
  try {
    const own = new GoldenStore(join(dir, "golden"), join(dir, "results"));
    expect((await checkNodeFixture(withFonts, star, own, "update")).problems).toEqual([]);
    expect(seen).toEqual([text]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a suite with rasterCopy draws the PNG golden from that copy and snapshots the rendered SVG", async () => {
  const copied = defineGoldenSuite<string>({
    name: "temp",
    render: (svg) => svg,
    rasterCopy: (svg) => svg.replace("#ff0000", "#0000ff"),
    fixtures: [{ name: "box", input: red }],
  });
  expect((await checkNodeFixture(copied, box, store, "update")).problems).toEqual([]);
  expect(readFileSync(store.svgPath("box"), "utf8")).toContain("#ff0000");
  expect(readFileSync(store.pngPath("box")).equals(rasterizeSvg(blue))).toBe(true);
});
