import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runAction } from "../src/index.js";
import { type ActionTree, design, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("card.json", design());
  await tree.file("card.dark.json", design("#58a6ff"));
  await tree.file("data.json", { stats: { v: 12 } });
});

afterEach(async () => {
  await tree.remove();
});

const dryRun = { designs: "card.json", "data-file": "data.json", "dry-run": "true" };

test("writes every format of every design; the snippet shows the first with the design size", async () => {
  const run = await tree.run({ ...dryRun, formats: "png, svg, webp, gif", scale: "1" });
  expect(run.code, run.log).toBe(0);
  expect(run.outputs["files"]?.split("\n")).toEqual([
    "readmint/card.png",
    "readmint/card.svg",
    "readmint/card.webp",
    "readmint/card.gif",
    "readmint/card.dark.png",
    "readmint/card.dark.svg",
    "readmint/card.dark.webp",
    "readmint/card.dark.gif",
  ]);
  const png = await readFile(join(tree.root, "readmint", "card.png"));
  expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([40, 24]);
  expect(await tree.read("readmint/card.svg")).toMatch(/^<svg/);
  expect(run.outputs["snippet"]).toBe(
    [
      "<picture>",
      '  <source media="(prefers-color-scheme: dark)" srcset="readmint/card.dark.png">',
      '  <img alt="card" src="readmint/card.png" width="40" height="24">',
      "</picture>",
    ].join("\n"),
  );
});

test("quality makes the webp output lossy and leaves the other formats as they were", async () => {
  const plain = await tree.run({ ...dryRun, formats: "webp, png", scale: "1" });
  expect(plain.code, plain.log).toBe(0);
  const lossless = await readFile(join(tree.root, "readmint", "card.webp"));
  const png = await readFile(join(tree.root, "readmint", "card.png"));
  const run = await tree.run({ ...dryRun, formats: "webp, png", scale: "1", quality: "80" });
  expect(run.code, run.log).toBe(0);
  const lossy = await readFile(join(tree.root, "readmint", "card.webp"));
  expect(lossless.includes(Buffer.from("VP8L", "latin1"))).toBe(true);
  expect(lossy.includes(Buffer.from("VP8 ", "latin1"))).toBe(true);
  expect(lossy.includes(Buffer.from("VP8L", "latin1"))).toBe(false);
  expect((await readFile(join(tree.root, "readmint", "card.png"))).equals(png)).toBe(true);
});

test("quality without a webp format fails before anything is written", async () => {
  const run = await tree.run({ ...dryRun, formats: "png", quality: "80" });
  expect(run.code).toBe(1);
  expect(run.log).toContain("input quality applies to webp output only");
  expect(existsSync(join(tree.root, "readmint"))).toBe(false);
});

test("apng writes <stem>.png at the default scale", async () => {
  const run = await tree.run({ ...dryRun, formats: "apng" });
  expect(run.code).toBe(0);
  const png = await readFile(join(tree.root, "readmint", "card.png"));
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([80, 48]);
});

test("a raster export over a limit fails the run and writes nothing", async () => {
  await tree.file("wide.json", { ...design(), canvas: { width: 3000, height: 24 } });
  const run = await tree.run({ ...dryRun, designs: "card.json\nwide.json", formats: "svg,png" });
  expect(run.code).toBe(1);
  expect(run.log).toContain(
    "::error::wide.json: png export failed: the image would be 6000x48 pixels at scale 2",
  );
  expect(existsSync(join(tree.root, "readmint"))).toBe(false);
});

test("raster codecs that cannot be loaded are a render error before anything is written", async () => {
  const lines: string[] = [];
  const code = await runAction(
    {
      INPUT_DESIGNS: "card.json",
      "INPUT_DATA-FILE": "data.json",
      "INPUT_DRY-RUN": "true",
      INPUT_FORMATS: "png",
      GITHUB_WORKSPACE: tree.root,
    },
    {
      write: (text) => lines.push(text),
      runGit: () => {
        throw new Error("git must not run");
      },
      cwd: tree.root,
      initRaster: () =>
        Promise.reject(Object.assign(new Error("/abs/path/resvg.wasm"), { code: "ENOENT" })),
    },
  );
  expect(code).toBe(1);
  expect(lines.join("")).toContain(
    "::error::the raster codecs cannot be loaded (ENOENT); the Action bundle is incomplete",
  );
  expect(lines.join("")).not.toContain("/abs/path");
  expect(existsSync(join(tree.root, "readmint"))).toBe(false);
});
