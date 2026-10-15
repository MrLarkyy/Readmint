import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type ActionTree, design, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("card.json", design());
  await tree.file("data.json", { stats: { v: 12 } });
});

afterEach(async () => {
  await tree.remove();
});

const noGit = () => Promise.reject(new Error("git must not run"));
const noFetch = () => Promise.reject(new Error("fetch must not run"));

describe("runAction", () => {
  test("when one of two designs fails, nothing is written and the exit code is 1", async () => {
    await tree.file("bad.json", {
      version: 0,
      canvas: { width: 10, height: 10 },
      layers: [{ type: "rect", width: 1, height: "{{stats.missing.deeper}}" }],
    });
    const run = await tree.run(
      { designs: "card.json\nbad.json", "data-file": "data.json", "dry-run": "true" },
      { runGit: noGit },
    );
    expect(run.code).toBe(1);
    expect(run.log).toMatch(/^::error::bad\.json: error /);
    expect(await readdir(tree.root)).not.toContain("readmint");
    expect(run.outputText).toBe("");
  });

  test("a design that does not exist is reported by name", async () => {
    const run = await tree.run(
      { designs: "missing.json", "data-file": "data.json", "dry-run": "true" },
      { runGit: noGit },
    );
    expect(run.code).toBe(1);
    expect(run.log).toBe('::error::design file "missing.json" does not exist\n');
  });

  test("a design reached through a link outside the workspace is refused", async (context) => {
    const { symlink, writeFile } = await import("node:fs/promises");
    const outside = join(tree.base, "outside.json");
    await writeFile(outside, JSON.stringify(design()));
    try {
      await symlink(outside, join(tree.root, "linked.json"), "file");
    } catch {
      context.skip();
      return;
    }
    const run = await tree.run(
      { designs: "linked.json", "data-file": "data.json", "dry-run": "true" },
      { runGit: noGit },
    );
    expect(run.code).toBe(1);
    expect(run.log).toContain("resolves outside the root folder");
  });

  test("data-file replaces the GitHub load: fetch is never called", async () => {
    const run = await tree.run(
      { designs: "card.json", "data-file": "data.json", "dry-run": "true", token: "unused-token" },
      { runGit: noGit, fetch: noFetch },
    );
    expect(run.code).toBe(0);
  });

  test("a renderer warning is a ::warning:: line and the run succeeds", async () => {
    await tree.file("anim.json", {
      version: 0,
      canvas: { width: 10, height: 10 },
      animation: { duration: 1000, loop: false },
      layers: [
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{[0, 1, 2, 3, 4]}}" },
          animate: {
            opacity: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: 1 },
              ],
              stagger: 300,
              duration: 400,
            },
          },
        },
      ],
    });
    const run = await tree.run(
      { designs: "anim.json", "data-file": "data.json", "dry-run": "true" },
      { runGit: noGit },
    );
    expect(run.code).toBe(0);
    expect(run.log).toMatch(
      /^::warning::anim\.json: warning animation-cut at \/layers\/0\/animate\/opacity: /m,
    );
  });

  test("a value holding a newline and a workflow command stays one escaped line", async () => {
    const run = await tree.run(
      { designs: "card.json", "data-file": "data.json", locale: "x\n::error::forged%0A" },
      { runGit: noGit },
    );
    expect(run.code).toBe(1);
    const lines = run.log.split("\n").filter((line) => line !== "");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      '::error::input locale "x\\n::error::forged%250A" is not a BCP 47 language tag',
    );
  });

  test("the snippet is printed in a group and set as an output", async () => {
    await tree.file("card.dark.json", design("#58a6ff"));
    const run = await tree.run(
      { designs: "card.json", "data-file": "data.json", "dry-run": "true" },
      { runGit: noGit },
    );
    const snippet = [
      "<picture>",
      '  <source media="(prefers-color-scheme: dark)" srcset="readmint/card.dark.svg">',
      '  <img alt="card" src="readmint/card.svg">',
      "</picture>",
    ].join("\n");
    expect(run.log).toContain(`::group::README snippet\n${snippet}\n::endgroup::\n`);
    expect(run.outputs.snippet).toBe(snippet);
    expect(await tree.read("readmint/card.dark.svg")).toContain("#58a6ff");
  });

  test("an unexpected error prints its name only", async () => {
    const run = await tree.run(
      { designs: "card.json", "data-file": "data.json" },
      {
        runGit: () => {
          throw new TypeError("detail that could hold data");
        },
      },
    );
    expect(run.code).toBe(1);
    expect(run.log).toBe("::error::internal error (TypeError)\n");
  });

  test("without GITHUB_OUTPUT the outputs are logged", async () => {
    const run = await tree.run(
      { designs: "card.json", "data-file": "data.json", "dry-run": "true" },
      { runGit: noGit, env: { GITHUB_OUTPUT: "" } },
    );
    expect(run.code).toBe(0);
    expect(run.log).toContain("changed: true\ncommit: \nfile: readmint/card.svg\n");
  });
});
