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
  const io = { env: { GH_TOKEN: "canary-token-RM39", GITHUB_TOKEN: "canary-token-RM39" } };
  const runs = [
    await tree.run(["render", "bound/design.json", "--data", "data.json"], io),
    await tree.run(["validate", "bound/design.json", "--data", "data.json"], io),
    await tree.run(["render", "bound/design.json"], io),
    await tree.run(["render", "bound/design.json", "--data", "missing.json"], io),
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

test("--data-json with a file source never fetches", async () => {
  await tree.file("bound/json.json", boundDesign("{{ v.document.v }}"));
  const fetch = vi.spyOn(globalThis, "fetch");
  const run = await tree.run(["render", "bound/json.json", "--data-json", "v=data.json"]);
  expect(run.stderr).toBe("");
  expect(run.code).toBe(ExitCode.ok);
  expect(fetch).not.toHaveBeenCalled();
});

test("--data-feed with a refused URL is a usage error before any request", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const run = await tree.run([
    "render",
    "bound/design.json",
    "--data-feed",
    "http://x.example/feed",
  ]);
  expect(run.code).toBe(ExitCode.usage);
  expect(run.stderr).not.toContain("x.example");
  expect(fetch).not.toHaveBeenCalled();
});
