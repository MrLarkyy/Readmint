import { readdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type ActionTree, CANARY, makeActionTree } from "./actionTree.js";

let tree: ActionTree;
let requests: string[];

function design(name: string): object {
  return {
    version: 0,
    canvas: { width: 20, height: 20 },
    layers: [
      {
        type: "group",
        let: { [name]: "{{ 1 }}" },
        children: [{ type: "rect", width: 10, height: 10, fill: "#0969da" }],
      },
    ],
  };
}

const spy = (url: string): Promise<Response> => {
  requests.push(url);
  return Promise.resolve(new Response("{}", { headers: { "content-type": "application/json" } }));
};

const noGit = () => Promise.reject(new Error("git must not run"));
const dry = { "dry-run": "true", token: CANARY };

beforeEach(async () => {
  tree = await makeActionTree();
  requests = [];
  await tree.file("clash.json", design("total"));
  await tree.file("ok.json", design("count"));
  await tree.file("gh.json", design("github"));
  await tree.file("data.json", { stats: { v: 1 } });
});

afterEach(async () => {
  await tree.remove();
});

describe("a let name equal to a data namespace", () => {
  test.each([
    ["data-json", "total=https://data.example/a.json"],
    ["data-feed", "total=https://blog.example/feed.xml"],
    ["data-wakatime", "total=WAKA"],
    ["data-registry", "total=npm:react"],
  ])("%s fails before any request", async (input, value) => {
    const run = await tree.run(
      { designs: "clash.json", [input]: value, ...dry },
      { fetch: spy, runGit: noGit, env: { WAKA: "waka_0123456789abcdef" } },
    );
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::clash.json: error binding at /layers/0/let/total");
    expect(run.log).toContain(`namespace of --${input} "total"`);
    expect(run.log).not.toContain("example");
    expect(run.log).not.toContain(CANARY);
    expect(requests).toEqual([]);
    expect(await readdir(tree.root)).not.toContain("readmint");
  });

  test("the GitHub data (no data-file) reserves the github name", async () => {
    const run = await tree.run({ designs: "gh.json", ...dry }, { fetch: spy, runGit: noGit });
    expect(run.code).toBe(1);
    expect(run.log).toContain('namespace of --github "github"');
    expect(run.log).not.toContain(CANARY);
    expect(requests).toEqual([]);
  });

  test("with a data-file the github name is free", async () => {
    const run = await tree.run(
      { designs: "gh.json", "data-file": "data.json", "dry-run": "true" },
      { fetch: spy, runGit: noGit },
    );
    expect(run.code).toBe(0);
    expect(requests).toEqual([]);
  });

  test("the dark twin is checked too", async () => {
    await tree.file("both.json", design("count"));
    await tree.file("both.dark.json", design("total"));
    const run = await tree.run(
      { designs: "both.json", "data-json": "total=https://data.example/a.json", ...dry },
      { fetch: spy, runGit: noGit },
    );
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::both.dark.json: error binding");
    expect(requests).toEqual([]);
  });

  test("a design rendered twice by a manifest is reported once", async () => {
    await tree.file("m/renders.json", {
      renders: [
        { name: "a", design: "d.json" },
        { name: "b", design: "d.json" },
      ],
    });
    await tree.file("m/d.json", design("total"));
    const run = await tree.run(
      { manifest: "m/renders.json", "data-json": "total=https://data.example/a.json", ...dry },
      { fetch: spy, runGit: noGit },
    );
    const lines = run.log.split("\n").filter((line) => line.startsWith("::error::d.json:"));
    expect(lines).toHaveLength(1);
  });

  test("a missing design is left to the render step", async () => {
    const run = await tree.run(
      {
        designs: "missing.json",
        "data-file": "data.json",
        "data-json": "total=data.json",
        "dry-run": "true",
      },
      { fetch: spy, runGit: noGit },
    );
    expect(run.code).toBe(1);
    expect(run.log).toBe('::error::design file "missing.json" does not exist\n');
  });

  test("a manifest run checks its designs", async () => {
    await tree.file("m/renders.json", { renders: [{ name: "a", design: "d.json" }] });
    await tree.file("m/d.json", design("total"));
    const run = await tree.run(
      { manifest: "m/renders.json", "data-json": "total=https://data.example/a.json", ...dry },
      { fetch: spy, runGit: noGit },
    );
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::d.json: error binding at /layers/0/let/total");
    expect(requests).toEqual([]);
  });

  test("no clash: the data loads", async () => {
    const run = await tree.run(
      {
        designs: "ok.json",
        "data-file": "data.json",
        "data-json": "extra=https://data.example/a.json",
        "dry-run": "true",
      },
      { fetch: spy, runGit: noGit },
    );
    expect(requests).toContain("https://data.example/a.json");
    expect(run.log).not.toContain("namespace of");
  });
});
