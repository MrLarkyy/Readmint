import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { runGit } from "../src/runGit.js";
import {
  type ActionTree,
  design,
  makeActionTree,
  recordingRunner,
  smokeDir,
} from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.initGit();
  await tree.file("card.json", design());
  await tree.file("data.json", { stats: { v: 12 } });
});

afterEach(async () => {
  await tree.remove();
});

test("a dry run writes the files but runs no git command", async () => {
  const head = tree.git("rev-parse", "HEAD");
  const remote = tree.originGit("rev-parse", "main");
  const recorder = recordingRunner(runGit);
  const run = await tree.run(
    { designs: "card.json", "data-file": "data.json", "dry-run": "true" },
    { runGit: recorder.runGit },
  );
  expect(run.code).toBe(0);
  expect(recorder.calls).toEqual([]);
  expect(run.log).toContain("dry run: would commit 1 file(s)");
  expect(run.outputs).toMatchObject({ changed: "true", commit: "", files: "readmint/card.svg" });
  expect(await tree.read("readmint/card.svg")).toMatch(/^<svg/);
  expect(tree.git("rev-parse", "HEAD")).toBe(head);
  expect(tree.originGit("rev-parse", "main")).toBe(remote);
  expect(tree.git("status", "--porcelain")).toBe("?? card.json\n?? data.json\n?? readmint/".trim());
});

test("a dry run needs no repository at all", async () => {
  await tree.file("card.json", design());
  const run = await tree.run(
    { designs: "card.json", "data-file": "data.json", "dry-run": "TRUE" },
    {
      runGit: () => {
        throw new Error("git must not run");
      },
    },
  );
  expect(run.code).toBe(0);
});

test("a dry run of the smoke fixtures binds a data-json file and runs no git", async () => {
  for (const name of ["card.json", "card.dark.json", "data.json", "counts.json"]) {
    await tree.file(name, await readFile(join(smokeDir, name)));
  }
  const run = await tree.run(
    {
      designs: "card.json",
      "data-file": "data.json",
      "data-json": "counts=counts.json",
      "dry-run": "true",
    },
    {
      runGit: () => {
        throw new Error("git must not run");
      },
    },
  );
  expect(run.code).toBe(0);
  expect(await tree.read("readmint/card.svg")).toContain('width="17"');
  expect(await tree.read("readmint/card.dark.svg")).toContain('width="17"');
});

test("a data-json source that cannot load fails the run with its line", async () => {
  const run = await tree.run({
    designs: "card.json",
    "data-file": "data.json",
    "data-json": "counts=missing.json",
    "dry-run": "true",
  });
  expect(run.code).not.toBe(0);
  expect(run.log).toContain(
    '::error::JSON data counts (not-found): The JSON file "missing.json" does not exist.',
  );
});

test("a data-json namespace the data-file holds fails the run naming it", async () => {
  await tree.file("stats.json", { v: 3 });
  const run = await tree.run({
    designs: "card.json",
    "data-file": "data.json",
    "data-json": "stats=stats.json",
    "dry-run": "true",
  });
  expect(run.code).not.toBe(0);
  expect(run.log).toContain("data namespace stats");
});
