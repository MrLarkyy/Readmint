import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

const inputs = (extra: Record<string, string> = {}): Record<string, string> => ({
  designs: "card.json",
  login: "readmint-fixture",
  "language-commit-cap": "3",
  "cache-dir": "cache",
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

    const entries = await readdir(join(tree.root, "cache"), {
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
    await writeFile(join(tree.root, "cache"), "x");
    const replay = authoredFetch();
    const run = await tree.run(inputs(), { ...noGit, fetch: replay.fetch });
    expect(run.code).toBe(1);
    expect(run.log).toContain("is not a folder");
    expect(replay.urls).toEqual([]);
  });

  test.each([
    ["data-file", { "data-file": "card.json" }],
    ["the workspace itself", { "cache-dir": "." }],
    ["output-dir", { "cache-dir": "readmint" }],
    ["inside output-dir", { "cache-dir": "readmint/x" }],
    ["inside a custom output-dir", { "cache-dir": "out/a/b", "output-dir": "out" }],
  ])("%s is an input error with no request", async (_name, extra) => {
    const replay = authoredFetch();
    const run = await tree.run(inputs(extra), { ...noGit, fetch: replay.fetch });
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::");
    expect(run.log).toContain("cache-dir");
    expect(replay.urls).toEqual([]);
  });

  test.runIf(process.platform === "win32")(
    "output-dir is compared ignoring case on Windows",
    async () => {
      const run = await tree.run(inputs({ "cache-dir": "Readmint/x" }), {
        ...noGit,
        fetch: authoredFetch().fetch,
      });
      expect(run.code).toBe(1);
      expect(run.log).toContain("output-dir");
    },
  );
});
