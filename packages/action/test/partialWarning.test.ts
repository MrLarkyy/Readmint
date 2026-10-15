import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type ActionTree, CANARY, makeActionTree } from "./actionTree.js";

const fixtures = join(import.meta.dirname, "..", "..", "data-github", "test", "fixtures");
const names: Record<string, string> = {
  ReadmintProfile: "profile",
  ReadmintRepositories: "repositories-3",
  ReadmintActivity: "activity-forbidden",
  ReadmintWeeks: "weeks-graphql-error",
};

const fetch = (_url: string, init: RequestInit): Promise<Response> => {
  const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
    operationName?: string;
  };
  const file = join(fixtures, `${names[sent.operationName ?? ""] ?? "viewer"}.json`);
  const { body } = JSON.parse(readFileSync(file, "utf8")) as { body: unknown };
  return Promise.resolve(Response.json(body));
};

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

test("partial GitHub data is one ::warning:: line naming the parts, never the token", async () => {
  const run = await tree.run(
    { designs: "card.json", login: "readmint-fixture", "dry-run": "true", token: CANARY },
    { runGit: () => Promise.reject(new Error("git must not run")), fetch },
  );
  expect(run.code).toBe(0);
  const lines = run.log.split("\n").filter((line) => line.startsWith("::warning::"));
  expect(lines).toEqual([
    "::warning::GitHub data is incomplete (activity, weeks): github.status, github.pushes and github.pinned[].weeklyCommits may be empty",
  ]);
  expect(run.log).not.toContain(CANARY);
});
