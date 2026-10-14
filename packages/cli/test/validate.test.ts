import { afterEach, beforeEach, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { boundDesign, type CliTree, makeCliTree, png } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("bound/design.json", boundDesign());
  await tree.file("bound/logo.png", png);
});

afterEach(async () => {
  await tree.remove();
});

test("prints <name>: ok for a valid design without rendering it when there is no data", async () => {
  // Without --data every binding would fail; validate does not render.
  expect(await tree.run(["validate", "bound/design.json"])).toEqual({
    code: ExitCode.ok,
    stdout: "bound/design.json: ok\n",
    stderr: "",
  });
});

test("with --data renders and passes", async () => {
  await tree.file("data.json", { v: 3 });
  expect(await tree.run(["validate", "bound/design.json", "--data", "data.json"])).toEqual({
    code: ExitCode.ok,
    stdout: "bound/design.json: ok\n",
    stderr: "",
  });
});

test("with --data reports a render issue", async () => {
  await tree.file("data.json", { v: -3 });
  const run = await tree.run(["validate", "bound/design.json", "--data", "data.json"]);
  expect(run.code).toBe(ExitCode.invalid);
  expect(run.stdout).toBe("");
  expect(run.stderr).toMatch(/^bound\/design\.json: error range at \/layers\/0\/height: /);
});

test("loads every declared asset: a broken one fails even without data", async () => {
  await tree.file("lost/design.json", boundDesign());
  const run = await tree.run(["validate", "lost/design.json"]);
  expect(run).toEqual({
    code: ExitCode.invalid,
    stdout: "",
    stderr:
      'lost/design.json: error asset at /assets/images/logo/src: asset "logo.png" does not exist in the design folder\n',
  });
});

test("an asset path that leaves the design folder through a parent segment", async () => {
  const design = boundDesign() as { assets: { images: { logo: { src: string } } } };
  design.assets.images.logo.src = "../bound/logo.png";
  await tree.file("other/design.json", design);
  const run = await tree.run(["validate", "other/design.json"]);
  expect(run.code).toBe(ExitCode.invalid);
});

test("reports every design issue with its position", async () => {
  await tree.file(
    "bad.json",
    '{ "version": 0, "canvas": { "width": 1, "height": 1 }, "layers": [], "x": 1, "y": 2 }',
  );
  const run = await tree.run(["validate", "bad.json"]);
  expect(run.code).toBe(ExitCode.invalid);
  expect(run.stderr.trimEnd().split("\n")).toEqual([
    'bad.json: error unknown-property at /x: unknown property "x"',
    'bad.json: error unknown-property at /y: unknown property "y"',
  ]);
});

test("reads .yaml and .yml as YAML, also in flow style", async () => {
  const flow = "{version: 0, canvas: {width: 1, height: 1}, layers: []}";
  await tree.file("flow.yaml", flow);
  await tree.file("flow.yml", flow);
  await tree.file("flow.json", flow);
  expect((await tree.run(["validate", "flow.yaml"])).code).toBe(ExitCode.ok);
  expect((await tree.run(["validate", "flow.yml"])).code).toBe(ExitCode.ok);
  expect((await tree.run(["validate", "flow.json"])).code).toBe(ExitCode.invalid);
});
