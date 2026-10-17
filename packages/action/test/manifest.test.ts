import { cp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import { type ActionTree, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

const folder = "designs/horizon";
const slots = [1, 2, 3, 4, 5, 6] as const;
const names = slots.map((slot) => `repo-${String(slot)}`);

const manifest = {
  renders: slots.map((slot) => ({
    name: `repo-${String(slot)}`,
    design: "repo-1.json",
    props: { slot: slot - 1 },
    variants: ["dark"],
  })),
};

beforeEach(async () => {
  tree = await makeActionTree();
  await cp(
    join(import.meta.dirname, "..", "..", "components", "templates", "profiles", "horizon"),
    join(tree.root, folder),
    { recursive: true },
  );
  await tree.file("data.json", sampleProfileData());
  await tree.file(`${folder}/renders.json`, manifest);
});

afterEach(async () => {
  await tree.remove();
});

const plain = { "data-file": "data.json", "dry-run": "true" };

const dry = {
  "data-file": "data.json",
  "props-file": `${folder}/settings.json`,
  "dry-run": "true",
};

describe("the manifest input", () => {
  test("six renders write the bytes of the designs list of repo-1..6 and their twins, light and dark", async () => {
    const listed = await tree.run({
      ...dry,
      designs: names.map((name) => `${folder}/${name}.json`).join("\n"),
      "output-dir": "listed",
    });
    expect(listed.code).toBe(0);
    const made = await tree.run({
      ...dry,
      manifest: `${folder}/renders.json`,
      "output-dir": "made",
    });
    expect(made.code).toBe(0);
    // The template settings name sections this manifest does not render.
    expect(made.log.match(/::warning::.*/g)).toEqual(
      ["footer", "header", "stack", "worked"].map(
        (name) => `::warning::props-file section "${name}" names no listed design or render`,
      ),
    );
    const files = (await readdir(join(tree.root, "made"))).sort();
    expect(files).toEqual((await readdir(join(tree.root, "listed"))).sort());
    expect(files).toHaveLength(12);
    for (const file of files) {
      expect(await tree.read(`made/${file}`), file).toBe(await tree.read(`listed/${file}`));
    }
    expect(made.outputs["files"]?.split("\n")).toHaveLength(12);
  });

  test("the snippet is built from the names", async () => {
    const run = await tree.run({
      ...dry,
      manifest: `${folder}/renders.json`,
      "output-dir": "img",
    });
    expect(run.outputs["snippet"]).toContain(
      [
        "<picture>",
        '  <source media="(prefers-color-scheme: dark)" srcset="img/repo-3.dark.svg">',
        '  <img alt="repo-3" src="img/repo-3.svg">',
        "</picture>",
      ].join("\n"),
    );
    expect(run.outputs["snippet"]?.match(/<picture>/g)).toHaveLength(6);
  });

  test("the variant input applies to a render without variants, and [] means none", async () => {
    await tree.file("a.json", {
      version: 0,
      canvas: { width: 20, height: 10 },
      components: {
        box: {
          props: { theme: { type: "enum", values: ["light", "dark"], default: "light" } },
          layers: [
            {
              type: "rect",
              width: 10,
              height: 10,
              fill: '{{ props.theme == "dark" ? "#000000" : "#ffffff" }}',
            },
          ],
        },
      },
      layers: [{ type: "component", ref: "box" }],
    });
    await tree.file("m.json", {
      renders: [
        { name: "open", design: "a.json" },
        { name: "none", design: "a.json", variants: [] },
      ],
    });
    const run = await tree.run({ manifest: "m.json", variant: "dark", ...plain });
    expect(run.code).toBe(0);
    expect(run.outputs["files"]?.split("\n").sort()).toEqual([
      "readmint/none.svg",
      "readmint/open.dark.svg",
      "readmint/open.svg",
    ]);
    expect(await tree.read("readmint/open.dark.svg")).toContain("#000000");
    expect(await tree.read("readmint/open.svg")).toContain("#ffffff");
  });

  test("an unused props section names the render", async () => {
    await tree.file("s.json", { "repo-2": { slot: 3 }, ghost: { slot: 1 } });
    const run = await tree.run({
      ...dry,
      manifest: `${folder}/renders.json`,
      "props-file": "s.json",
    });
    expect(run.code).toBe(0);
    expect(run.log).toContain(
      '::warning::props-file section "ghost" names no listed design or render',
    );
    expect(run.log).toContain(
      'repo-1.json (render "repo-2"): settings section "repo-2" sets "slot", which overrides the props of render "repo-2"',
    );
    expect(run.log).not.toContain('section "repo-2" names no listed');
  });
});

describe("an invalid manifest", () => {
  async function failing(content: object, extra: Record<string, string> = {}) {
    await tree.file("m.json", content);
    await tree.file("a.json", {
      version: 0,
      canvas: { width: 20, height: 10 },
      layers: [{ type: "rect", width: 10, height: 10, fill: "#1a7f37" }],
    });
    const run = await tree.run({ manifest: "m.json", ...plain, ...extra });
    expect(run.code).toBe(1);
    expect(await readdir(tree.root)).not.toContain("readmint");
    return run.log;
  }

  test("lists the errors with pointers and never a value", async () => {
    const log = await failing({
      renders: [
        { name: "a", design: "a.json", props: { p: { q: "V4LUE-SENTINEL" } } },
        { name: "A", design: "../a.json" },
        { name: "b", design: "missing.json" },
      ],
    });
    expect(log).toContain('::error::manifest "m.json": error type at /renders/0/props/p');
    expect(log).toContain('::error::manifest "m.json": error duplicate-name at /renders/1/name');
    expect(log).toContain('::error::manifest "m.json": error pattern at /renders/1/design');
    expect(log).not.toContain("V4LUE-SENTINEL");
  });

  test("an unknown design is refused with its pointer", async () => {
    const log = await failing({ renders: [{ name: "b", design: "missing.json" }] });
    expect(log).toContain(
      '::error::manifest "m.json": error unknown-reference at /renders/0/design: design file "missing.json" does not exist',
    );
  });

  test("a bad prop value at render time shows no value", async () => {
    const log = await failing({
      renders: [{ name: "b", design: "a.json", props: { v: "V4LUE-SENTINEL" } }],
    });
    expect(log).toContain("/renders/0/props");
    expect(log).not.toContain("V4LUE-SENTINEL");
  });

  test("the variant input clashing with a prop of a render without variants is refused", async () => {
    const log = await failing(
      { renders: [{ name: "a", design: "a.json", props: { theme: "light" } }] },
      { variant: "dark" },
    );
    expect(log).toContain(
      '::error::manifest "m.json": error duplicate-key at /renders/0/props/theme: the prop theme is also set by the dark variant; set it in one place',
    );
  });

  test("a manifest outside the workspace is refused", async () => {
    const run = await tree.run({ manifest: "../m.json", ...plain });
    expect(run.code).toBe(1);
    expect(run.log).toContain("::error::input manifest");
  });

  test("a missing manifest is an input error", async () => {
    const run = await tree.run({ manifest: "nope.json", ...plain });
    expect(run.code).toBe(1);
    expect(run.log).toContain('::error::manifest "nope.json"');
  });
});
