import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type ActionTree, makeActionTree } from "./actionTree.js";

const noGit = () => Promise.reject(new Error("git must not run"));

interface Request {
  url: string;
  init: RequestInit;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** npm knows `react` only (7 downloads); Maven knows `junit:junit` only. */
function registries(
  requests: Request[] = [],
): (url: string, init: RequestInit) => Promise<Response> {
  return (url, init) => {
    requests.push({ url, init });
    const target = new URL(url);
    if (target.hostname === "registry.npmjs.org") {
      return Promise.resolve(
        target.pathname === "/react/latest" ? json({ version: "19.1.0" }) : json({}, 404),
      );
    }
    if (target.hostname === "api.npmjs.org") return Promise.resolve(json({ downloads: 7 }));
    const known = target.searchParams.get("q") === 'g:"junit" AND a:"junit"';
    return Promise.resolve(
      json({
        response: {
          numFound: known ? 1 : 0,
          docs: known
            ? [{ g: "junit", a: "junit", latestVersion: "4.13.2", timestamp: 1_608_000_000_000 }]
            : [],
        },
      }),
    );
  };
}

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("data.json", { stats: { v: 12 } });
  await tree.file("libs.json", {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    layers: [
      {
        type: "rect",
        x: 0,
        y: 0,
        width: "{{ registry.npm[0].weeklyDownloads }}",
        height: "{{ stats.v }}",
        fill: "#0969da",
      },
    ],
  });
});

afterEach(() => tree.remove());

test("a dry run with data-file binds data-registry through deps.fetch, no header but accept and user-agent", async () => {
  const requests: Request[] = [];
  const run = await tree.run(
    {
      designs: "libs.json",
      "data-file": "data.json",
      "data-registry": "npm:react\nmaven:junit:junit",
      "dry-run": "true",
    },
    { fetch: registries(requests), runGit: noGit },
  );
  expect(run.code).toBe(0);
  expect(requests).toHaveLength(3);
  for (const request of requests) {
    expect(new URL(request.url).protocol).toBe("https:");
    const names = [...new Headers(request.init.headers).keys()].sort();
    expect(names).toEqual(["accept", "user-agent"]);
  }
  expect(await tree.read("readmint/libs.svg")).toContain('width="7"');
  expect(run.log).toContain("dry run: would commit");
  expect(await readdir(join(tree.root, "readmint"))).toEqual(["libs.svg"]);
});

test("two runs with the same answers write byte-identical output", async () => {
  const inputs = {
    designs: "libs.json",
    "data-file": "data.json",
    "data-registry": "npm:react",
    "dry-run": "true",
  };
  const options = { fetch: registries(), runGit: noGit };
  expect((await tree.run(inputs, options)).code).toBe(0);
  const first = await tree.read("readmint/libs.svg");
  expect((await tree.run(inputs, options)).code).toBe(0);
  expect(await tree.read("readmint/libs.svg")).toBe(first);
});

test("an unknown entry is one ::warning:: line and the run succeeds", async () => {
  const run = await tree.run(
    {
      designs: "libs.json",
      "data-file": "data.json",
      "data-registry": "npm:react\nnpm:nosuchpackage-readmint",
      "dry-run": "true",
    },
    { fetch: registries(), runGit: noGit },
  );
  expect(run.code).toBe(0);
  expect(run.log.split("\n").filter((line) => line.startsWith("::warning::"))).toEqual([
    "::warning::Registry data registry has 1 unknown entry: npm:nosuchpackage-readmint; each is null in the data and was not cached",
  ]);
});

test("a failed load fails the run with the registry line", async () => {
  const run = await tree.run(
    {
      designs: "libs.json",
      "data-file": "data.json",
      "data-registry": "npm:react",
      "dry-run": "true",
    },
    { fetch: () => Promise.resolve(json({}, 418)), runGit: noGit },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain(
    "::error::Registry data registry (invalid-response): The npm registry API answered HTTP 418.",
  );
});

test("a data-file key equal to a registry namespace fails the run before any request", async () => {
  await tree.file("clash.json", { registry: {} });
  const requests: Request[] = [];
  const run = await tree.run(
    {
      designs: "libs.json",
      "data-file": "clash.json",
      "data-registry": "npm:react",
      "dry-run": "true",
    },
    { fetch: registries(requests), runGit: noGit },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain("data namespace registry");
  expect(requests).toEqual([]);
});

test("a bad entry is an input error before any request", async () => {
  const requests: Request[] = [];
  const run = await tree.run(
    {
      designs: "libs.json",
      "data-file": "data.json",
      "data-registry": "npm:Not_Valid",
      "dry-run": "true",
    },
    { fetch: registries(requests), runGit: noGit },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain(
    "input data-registry: registry entry 1 is not a valid npm package name",
  );
  expect(requests).toEqual([]);
});
