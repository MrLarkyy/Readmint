import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type ActionTree, CANARY, makeActionTree } from "./actionTree.js";
import { authoredFetch } from "./authoredFetch.js";

let tree: ActionTree;
beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("card.json", {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    layers: [{ type: "rect", x: 0, y: 0, width: 10, height: 10, fill: "#0969da" }],
  });
});
afterEach(() => tree.remove());

/** A folder next to the workspace, so outside it. */
const outside = (): string => join(dirname(tree.root), "cache");

const inputs = (extra: Record<string, string> = {}): Record<string, string> => ({
  designs: "card.json",
  login: "readmint-fixture",
  "language-commit-cap": "3",
  "cache-dir": outside(),
  "dry-run": "true",
  token: CANARY,
  ...extra,
});
const noGit = { runGit: () => Promise.reject(new Error("git must not run")) };

describe("cache-dir", () => {
  test("a second run sends no request and writes the same outputs; the token is nowhere in the cache", async () => {
    const first = authoredFetch();
    const one = await tree.run(inputs(), { ...noGit, fetch: first.fetch });
    expect(one.code).toBe(0);
    expect(first.rest()).toHaveLength(3);
    const svg = await tree.read("readmint/card.svg");

    const second = authoredFetch();
    const two = await tree.run(inputs(), { ...noGit, fetch: second.fetch });
    expect(two.code).toBe(0);
    expect(second.rest()).toEqual([]);
    expect(second.urls.length).toBeLessThanOrEqual(1);
    expect(two.outputs.snippet).toBe(one.outputs.snippet);
    expect(await tree.read("readmint/card.svg")).toBe(svg);

    const entries = await readdir(outside(), {
      recursive: true,
      withFileTypes: true,
    });
    const found = entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
    expect(found.length).toBeGreaterThan(3);
    const base64 = Buffer.from(CANARY).toString("base64");
    for (const text of [one.log, two.log, ...found]) {
      expect(text).not.toContain(CANARY);
      expect(text).not.toContain(base64);
    }
    for (const file of found) {
      const content = (await readFile(file)).toString("latin1");
      expect(content).not.toContain(CANARY);
      expect(content).not.toContain(base64);
    }
  });

  test("a cache path that is a file is a data error before any request", async () => {
    await writeFile(outside(), "x");
    const replay = authoredFetch();
    const run = await tree.run(inputs(), { ...noGit, fetch: replay.fetch });
    expect(run.code).toBe(1);
    expect(run.log).toContain("is not a folder");
    expect(replay.urls).toEqual([]);
  });

  test.each([
    ["data-file", { "data-file": "card.json" }],
    ["the workspace itself", { "cache-dir": "." }],
    ["a folder in the workspace", { "cache-dir": "cache" }],
    ["a nested folder in the workspace", { "cache-dir": "docs/x" }],
    ["output-dir", { "cache-dir": "readmint" }],
    ["~", { "cache-dir": "~/cache" }],
  ])("%s is an input error with no request", async (_name, extra) => {
    const replay = authoredFetch();
    const run = await tree.run(inputs(extra), { ...noGit, fetch: replay.fetch });
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::input cache-dir");
    expect(replay.urls).toEqual([]);
  });

  test("an absolute path inside the workspace is refused, a sibling named like it is not", async () => {
    const inside = await tree.run(inputs({ "cache-dir": join(tree.root, "x") }), {
      ...noGit,
      fetch: authoredFetch().fetch,
    });
    expect(inside.code).toBe(1);
    const sibling = await tree.run(inputs({ "cache-dir": `${tree.root}-cache` }), {
      ...noGit,
      fetch: authoredFetch().fetch,
    });
    expect(sibling.code).toBe(0);
    const dots = await tree.run(inputs({ "cache-dir": join(tree.root, "..x") }), {
      ...noGit,
      fetch: authoredFetch().fetch,
    });
    expect(dots.code).toBe(1);
  });

  test.runIf(process.platform === "win32")(
    "the workspace is compared ignoring case on Windows",
    async () => {
      const run = await tree.run(inputs({ "cache-dir": join(tree.root.toUpperCase(), "x") }), {
        ...noGit,
        fetch: authoredFetch().fetch,
      });
      expect(run.code).toBe(1);
    },
  );
});
