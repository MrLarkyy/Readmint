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

test("a data-feed namespace the data-file holds fails the run naming it", async () => {
  const run = await tree.run(
    {
      designs: "card.json",
      "data-file": "data.json",
      "data-feed": "stats=https://feeds.example/x.xml?key=feedKEY123",
      "dry-run": "true",
    },
    {
      fetch: () =>
        Promise.resolve(
          new Response('<rss version="2.0"><channel><title>t</title></channel></rss>', {
            headers: { "content-type": "application/rss+xml" },
          }),
        ),
    },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain("data namespace stats");
  expect(run.log).not.toContain("feedKEY123");
});

test("a dry run binds a fixture feed fetched through deps.fetch, never logging its URL", async () => {
  const feed = await readFile(
    join(import.meta.dirname, "..", "..", "data-feed", "test", "fixtures", "unsorted.rss.xml"),
    "utf8",
  );
  const url = "https://feeds.example/unsorted.xml?key=feedKEY123";
  await tree.file("feed.json", {
    version: 0,
    canvas: { width: 40, height: 24, background: "#ffffff" },
    layers: [
      {
        type: "rect",
        x: 0,
        y: 0,
        width: "{{ posts.entries | length }}",
        height: 4,
        fill: "#0969da",
      },
    ],
  });
  const requests: string[] = [];
  const run = await tree.run(
    {
      designs: "feed.json",
      "data-file": "data.json",
      "data-feed": `posts=${url}`,
      "data-feed-limits": "posts=3",
      "dry-run": "true",
    },
    {
      fetch: (requested) => {
        requests.push(requested);
        return Promise.resolve(
          new Response(feed, { headers: { "content-type": "application/rss+xml" } }),
        );
      },
      runGit: () => {
        throw new Error("git must not run");
      },
    },
  );
  expect(run.code).toBe(0);
  expect(requests).toEqual([url]);
  expect(await tree.read("readmint/feed.svg")).toContain('width="3"');
  expect(run.log).not.toContain("feedKEY123");
});

test("a feed that cannot load fails the run with its line and no URL", async () => {
  const run = await tree.run(
    {
      designs: "card.json",
      "data-file": "data.json",
      "data-feed": "https://feeds.example/x.xml?key=feedKEY123",
      "dry-run": "true",
    },
    { fetch: () => Promise.resolve(new Response("", { status: 404 })) },
  );
  expect(run.code).not.toBe(0);
  expect(run.log).toContain("::error::Feed data feed (not-found): The feed URL answered HTTP 404.");
  expect(run.log).not.toContain("feedKEY123");
  expect(run.log).not.toContain("feeds.example");
});
