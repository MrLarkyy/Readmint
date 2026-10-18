import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { wakaTimeSecretForms } from "@readmint/data-wakatime";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type ActionTree, makeActionTree } from "./actionTree.js";

const KEY = "waka_ACTION0rm158-0000-4000-8000-c4n4ryk3y000";
const STATS = await readFile(
  join(
    import.meta.dirname,
    "..",
    "..",
    "data-wakatime",
    "test",
    "fixtures",
    "stats-last_7_days.json",
  ),
  "utf8",
);
const STATS_URL = "https://wakatime.com/api/v1/users/current/stats/last_7_days";

const noGit = () => Promise.reject(new Error("git must not run"));

function answering(
  answer: () => Response,
  requests: { url: string; init: RequestInit }[] = [],
): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(answer());
  };
}

const stats = () => new Response(STATS, { headers: { "content-type": "application/json" } });

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("data.json", { stats: { v: 12 } });
  await tree.file("coding.json", {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    layers: [
      {
        type: "rect",
        x: 0,
        y: 0,
        width: "{{ wakatime.languages | length }}",
        height: "{{ stats.v }}",
        fill: "#0969da",
      },
    ],
  });
});

afterEach(() => tree.remove());

function expectNoKey(text: string): void {
  for (const form of wakaTimeSecretForms(KEY)) expect(text).not.toContain(form);
}

test("a dry run with data-file binds data-wakatime through deps.fetch, masking the key first", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const run = await tree.run(
    {
      designs: "coding.json",
      "data-file": "data.json",
      "data-wakatime": "WAKATIME_API_KEY",
      "dry-run": "true",
    },
    { env: { WAKATIME_API_KEY: KEY }, fetch: answering(stats, requests), runGit: noGit },
  );
  expect(run.code).toBe(0);
  expect(requests.map((request) => request.url)).toEqual([STATS_URL]);
  expect(new Headers(requests[0]?.init.headers).get("authorization")).toBe(`Basic ${btoa(KEY)}`);
  const svg = await tree.read("readmint/coding.svg");
  expect(svg).toContain('width="5"');
  expect(svg).toContain('height="12"');
  const masks = run.log.split("\n").filter((line) => line.startsWith("::add-mask::"));
  expect(masks).toContain(`::add-mask::${KEY}`);
  expect(masks).toContain(`::add-mask::Basic ${btoa(KEY)}`);
  expect(run.log.indexOf("::add-mask::")).toBeLessThan(run.log.indexOf("rendered "));
  const unmasked = run.log
    .split("\n")
    .filter((line) => !line.startsWith("::add-mask::"))
    .join("\n");
  expectNoKey(unmasked);
  expectNoKey(run.outputText);
  for (const name of await readdir(join(tree.root, "readmint"))) {
    expectNoKey(await tree.read(`readmint/${name}`));
  }
});

test("two runs with the same answer write byte-identical output", async () => {
  const inputs = {
    designs: "coding.json",
    "data-file": "data.json",
    "data-wakatime": "WAKATIME_API_KEY",
    "dry-run": "true",
  };
  const options = { env: { WAKATIME_API_KEY: KEY }, fetch: answering(stats), runGit: noGit };
  expect((await tree.run(inputs, options)).code).toBe(0);
  const first = await tree.read("readmint/coding.svg");
  expect((await tree.run(inputs, options)).code).toBe(0);
  expect(await tree.read("readmint/coding.svg")).toBe(first);
});

test("a 202 answer is one ::warning:: line and the run succeeds", async () => {
  await tree.file("total.json", {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    layers: [
      { type: "rect", width: "{{ wakatime.totalSeconds + 4 }}", height: 4, fill: "#0969da" },
    ],
  });
  const run = await tree.run(
    {
      designs: "total.json",
      "data-file": "data.json",
      "data-wakatime": "WAKATIME_API_KEY",
      "dry-run": "true",
    },
    {
      env: { WAKATIME_API_KEY: KEY },
      fetch: answering(() => new Response(null, { status: 202 })),
      runGit: noGit,
    },
  );
  expect(run.code).toBe(0);
  expect(run.log.split("\n").filter((line) => line.startsWith("::warning::"))).toEqual([
    "::warning::WakaTime data wakatime is incomplete: WakaTime is still calculating the stats, so the numbers may be low or empty (run again later; this answer was not cached)",
  ]);
  expect(await tree.read("readmint/total.svg")).toContain('width="4"');
});

test("an unset variable fails the run naming it, before any request", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const run = await tree.run(
    {
      designs: "coding.json",
      "data-file": "data.json",
      "data-wakatime": "MISSING_KEY",
      "dry-run": "true",
    },
    { fetch: answering(stats, requests), runGit: noGit },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain(
    "::error::WakaTime data wakatime needs the API key in environment variable MISSING_KEY, which is not set or empty",
  );
  expect(requests).toEqual([]);
});

test("an invalid key fails with the WakaTime line, the key masked and never printed", async () => {
  const run = await tree.run(
    {
      designs: "coding.json",
      "data-file": "data.json",
      "data-wakatime": "WAKATIME_API_KEY",
      "dry-run": "true",
    },
    {
      env: { WAKATIME_API_KEY: ` ${KEY}\n` },
      fetch: (_url, init) =>
        Promise.resolve(
          Response.json(
            { error: new Headers(init.headers).get("authorization") ?? "" },
            { status: 401 },
          ),
        ),
      runGit: noGit,
    },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain(
    "::error::WakaTime data wakatime (unauthorized): WakaTime rejected the API key (HTTP 401).",
  );
  expectNoKey(
    run.log
      .split("\n")
      .filter((line) => !line.startsWith("::add-mask::"))
      .join("\n"),
  );
});

test("a data-file key equal to a WakaTime namespace fails the run naming it, before any request", async () => {
  await tree.file("clash.json", { wakatime: {} });
  const requests: { url: string; init: RequestInit }[] = [];
  const run = await tree.run(
    {
      designs: "coding.json",
      "data-file": "clash.json",
      "data-wakatime": "WAKATIME_API_KEY",
      "dry-run": "true",
    },
    { env: { WAKATIME_API_KEY: KEY }, fetch: answering(stats, requests), runGit: noGit },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain("data namespace wakatime");
  expect(requests).toEqual([]);
});
