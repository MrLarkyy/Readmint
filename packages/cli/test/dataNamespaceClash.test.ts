import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

const rect = { type: "rect", width: 10, height: "{{ total }}", fill: "#0969da" };

function design(layers: readonly object[], components?: object): object {
  return {
    version: 0,
    canvas: { width: 20, height: 20 },
    ...(components === undefined ? {} : { components }),
    layers,
  };
}

function withLet(name: string): object {
  return { type: "group", let: { [name]: "{{ 1 }}" }, children: [rect] };
}

let tree: CliTree;
let requests: string[];

beforeEach(async () => {
  tree = await makeCliTree();
  requests = [];
  await tree.file("clash/design.json", design([withLet("total")]));
  await tree.file("ok/design.json", design([withLet("count")]));
  await tree.file("nested/design.json", design([{ type: "group", children: [withLet("total")] }]));
  await tree.file("component/design.json", design([], { badge: { layers: [withLet("total")] } }));
  await tree.file("data/doc.json", "{}");
});

afterEach(async () => {
  await tree.remove();
});

function spy(): { fetch: (url: string) => Promise<Response> } {
  return {
    fetch: (url) => {
      requests.push(url);
      return Promise.resolve(
        new Response("{}", { headers: { "content-type": "application/json" } }),
      );
    },
  };
}

describe("a data namespace equal to a let name", () => {
  test("--data-json fails up front naming the entry and the option, without a request", async () => {
    const run = await tree.run(
      ["render", "clash/design.json", "--data-json", "total=https://data.example/a.json"],
      spy(),
    );
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("/layers/0/let/total");
    expect(run.stderr).toContain('namespace of --data-json "total"');
    expect(run.stderr).toContain("rename the let name");
    expect(run.stderr).not.toContain("data.example");
    expect(requests).toEqual([]);
  });

  test("a source that would fail to load is not read", async () => {
    const run = await tree.run([
      "render",
      "clash/design.json",
      "--data-json",
      "total=missing.json",
    ]);
    expect(run.code).toBe(ExitCode.invalid);
  });

  test("--data-feed likewise", async () => {
    const run = await tree.run(
      ["render", "clash/design.json", "--data-feed", "total=https://blog.example/feed.xml"],
      spy(),
    );
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('namespace of --data-feed "total"');
    expect(requests).toEqual([]);
  });

  test("validate fails the same way", async () => {
    const run = await tree.run(
      ["validate", "clash/design.json", "--data-json", "total=https://data.example/a.json"],
      spy(),
    );
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('namespace of --data-json "total"');
    expect(requests).toEqual([]);
  });

  test("a different namespace passes", async () => {
    const run = await tree.run(["render", "ok/design.json", "--data-json", "total=data/doc.json"]);
    expect(run.stderr).not.toContain("namespace of");
    const fine = await tree.run([
      "render",
      "clash/design.json",
      "--data-json",
      "stats=data/doc.json",
    ]);
    expect(fine.stderr).not.toContain("namespace of");
  });

  test("a let in a nested group is found", async () => {
    const run = await tree.run([
      "render",
      "nested/design.json",
      "--data-json",
      "total=data/doc.json",
    ]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain('namespace of --data-json "total"');
    expect(run.stderr).toContain("/layers/0/children/0/let/total");
  });

  test("a let in a component nobody instantiates is refused too", async () => {
    const run = await tree.run([
      "render",
      "component/design.json",
      "--data-json",
      "total=data/doc.json",
    ]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("/components/badge/layers/0/let/total");
  });
});
