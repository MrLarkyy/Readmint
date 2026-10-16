import { afterEach, beforeEach, expect, test } from "vitest";
import { type ActionTree, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

function boxDesign(props?: object): object {
  return {
    version: 0,
    canvas: { width: 40, height: 24 },
    components: {
      box: {
        props: { w: { type: "number", default: 5 } },
        layers: [{ type: "rect", width: "{{ props.w }}", height: 10, fill: "#0969da" }],
      },
    },
    layers: [{ type: "component", ref: "box", ...(props === undefined ? {} : { props }) }],
  };
}

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("box.json", boxDesign());
  await tree.file("box.dark.json", boxDesign());
  await tree.file("data.json", { stats: { v: 1 } });
  await tree.file("settings.json", { box: { w: 17 } });
});

afterEach(async () => {
  await tree.remove();
});

const inputs = {
  designs: "box.json",
  "data-file": "data.json",
  "props-file": "settings.json",
  "dry-run": "true",
};

test("the settings apply to a listed design and its dark twin", async () => {
  const run = await tree.run(inputs);
  expect(run.code).toBe(0);
  expect(run.log).not.toContain("::warning::");
  expect(await tree.read("readmint/box.svg")).toContain('width="17"');
  expect(await tree.read("readmint/box.dark.svg")).toContain('width="17"');
});

test("without props-file the component defaults render", async () => {
  const run = await tree.run({ ...inputs, "props-file": "" });
  expect(run.code).toBe(0);
  expect(await tree.read("readmint/box.svg")).toContain('width="5"');
});

test("a section naming no listed design warns once, without values", async () => {
  await tree.file("settings.json", { box: { w: 17 }, ghost: { w: "s3cret-word" } });
  const run = await tree.run(inputs);
  expect(run.code).toBe(0);
  expect(run.log.match(/::warning::/g)).toHaveLength(1);
  expect(run.log).toContain('props-file section "ghost" names no listed design');
  expect(run.log).not.toContain("s3cret-word");
});

test("a missing settings file fails as an input error", async () => {
  const run = await tree.run({ ...inputs, "props-file": "gone.json" });
  expect(run.code).toBe(1);
  expect(run.log).toContain('::error::settings file "gone.json" does not exist');
});

test("a wrong value fails the render naming the section and prop, not the value", async () => {
  await tree.file("settings.json", { box: { w: "s3cret-word" } });
  const run = await tree.run(inputs);
  expect(run.code).toBe(1);
  expect(run.log).toContain("error type at /box/w");
  expect(run.log).not.toContain("s3cret-word");
});

test("a bad or missing props-file fails before any GitHub request or git command", async () => {
  let requests = 0;
  const fetch = () => {
    requests += 1;
    return Promise.reject(new Error("no request expected"));
  };
  const runGit = () => {
    throw new Error("git must not run");
  };
  for (const file of ["gone.json", "bad.json"]) {
    await tree.file("bad.json", "[1]");
    const run = await tree.run(
      { designs: "box.json", "props-file": file, token: "t0ken-value" },
      { fetch, runGit },
    );
    expect(run.code).toBe(1);
  }
  expect(requests).toBe(0);
});
