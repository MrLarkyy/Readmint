import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ExitCode } from "../src/index.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign());
  await tree.file("bound/logo.png", png);
  await tree.file("data.json", { v: 4 });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await tree.remove();
});

test("render, validate and failures never fetch and never print a token from the environment", async () => {
  vi.stubEnv("GITHUB_TOKEN", "canary-token-RM19");
  vi.stubEnv("INPUT_TOKEN", "canary-token-RM19");
  const fetch = vi.spyOn(globalThis, "fetch");
  const runs = [
    await tree.run(["render", "bound/design.json", "--data", "data.json"]),
    await tree.run(["validate", "bound/design.json", "--data", "data.json"]),
    await tree.run(["render", "bound/design.json"]),
    await tree.run(["render", "bound/design.json", "--data", "missing.json"]),
  ];
  expect(runs.map((run) => run.code)).toEqual([
    ExitCode.ok,
    ExitCode.ok,
    ExitCode.invalid,
    ExitCode.input,
  ]);
  expect(fetch).not.toHaveBeenCalled();
  for (const run of runs) {
    expect(run.stdout).not.toContain("canary");
    expect(run.stderr).not.toContain("canary");
  }
});
