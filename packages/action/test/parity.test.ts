import { runCli } from "@readmint/cli";
import { afterEach, beforeEach, expect, test } from "vitest";
import { type ActionTree, makeActionTree, png } from "./actionTree.js";

let tree: ActionTree;

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("designs/badge.json", {
    version: 0,
    canvas: { width: 60, height: 24, background: "#ffffff" },
    assets: { images: { logo: { src: "logo.png" } } },
    layers: [
      { type: "rect", x: 0, y: 0, width: 10, height: "{{stats.v}}", fill: "#0969da" },
      { type: "image", asset: "logo", x: 12, y: 0, width: 24, height: 16 },
    ],
  });
  await tree.file("designs/logo.png", png);
  await tree.file("fixtures/data.json", { stats: { v: 1234.5 } });
});

afterEach(async () => {
  await tree.remove();
});

async function cliRender(): Promise<string> {
  let stdout = "";
  const code = await runCli(["render", "designs/badge.json", "--data", "fixtures/data.json"], {
    stdout: (text) => {
      stdout += text;
    },
    stderr: () => undefined,
    cwd: tree.root,
  });
  expect(code).toBe(0);
  return stdout;
}

test("the Action writes the bytes readmint render prints for the same design, assets and data", async () => {
  const run = await tree.run(
    { designs: "designs/badge.json", "data-file": "fixtures/data.json", "dry-run": "true" },
    { runGit: () => Promise.reject(new Error("no git in a dry run")) },
  );
  expect(run.code).toBe(0);
  expect(await tree.read("readmint/badge.svg")).toBe(await cliRender());
});
