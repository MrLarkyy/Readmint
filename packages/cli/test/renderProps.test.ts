import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { type CliTree, makeCliTree, propsDesign } from "./cliTree.js";

let tree: CliTree;

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("box.json", propsDesign());
  await tree.file("box.dark.json", propsDesign());
  await tree.file("other.json", propsDesign());
  await tree.file("settings.json", { box: { w: 17, tone: "#ff0000" } });
});

afterEach(async () => {
  await tree.remove();
});

describe("--props", () => {
  test("renders the bytes of the design with the props written into its root layer", async () => {
    await tree.file("written.json", propsDesign({ w: 17, tone: "#ff0000" }));
    const merged = await tree.run(["render", "box.json", "--props", "settings.json"]);
    const written = await tree.run(["render", "written.json"]);
    expect(merged).toMatchObject({ code: ExitCode.ok, stderr: "" });
    expect(merged.stdout).toBe(written.stdout);
    expect(merged.stdout).not.toBe((await tree.run(["render", "box.json"])).stdout);
  });

  test("the dark twin takes the same section", async () => {
    await tree.file("written.dark.json", propsDesign({ w: 17, tone: "#ff0000" }));
    const merged = await tree.run(["render", "box.dark.json", "--props", "settings.json"]);
    expect(merged.stdout).toBe((await tree.run(["render", "written.dark.json"])).stdout);
  });

  test("a design whose section is absent renders as without the file", async () => {
    const merged = await tree.run(["render", "other.json", "--props", "settings.json"]);
    expect(merged.stdout).toBe((await tree.run(["render", "other.json"])).stdout);
  });

  test("the file value wins over the layer literal", async () => {
    await tree.file("lit.json", propsDesign({ w: 3 }));
    await tree.file("settings.json", { lit: { w: 17 } });
    await tree.file("written.json", propsDesign({ w: 17 }));
    const merged = await tree.run(["render", "lit.json", "--props", "settings.json"]);
    expect(merged.stdout).toBe((await tree.run(["render", "written.json"])).stdout);
  });

  test("validate names the section and prop of a wrong value, never the value", async () => {
    await tree.file("settings.json", { box: { w: "s3cret-word" } });
    const run = await tree.run(["validate", "box.json", "--props", "settings.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("box.json: error type at /box/w:");
    expect(run.stderr).not.toContain("s3cret-word");
  });

  test("an undeclared prop fails with its section and prop", async () => {
    await tree.file("settings.json", { box: { colour: "#fff" } });
    const run = await tree.run(["validate", "box.json", "--props", "settings.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("error unknown-property at /box/colour");
  });

  test("a value outside an enum fails at its prop without echoing it", async () => {
    await tree.file("settings.json", { box: { kind: "zz-s3cret" } });
    const run = await tree.run(["validate", "box.json", "--props", "settings.json"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toContain("error enum at /box/kind");
    expect(run.stderr).not.toContain("s3cret");
  });

  test("a missing settings file is an input error", async () => {
    const run = await tree.run(["render", "box.json", "--props", "none.json"]);
    expect(run).toMatchObject({ code: ExitCode.input, stdout: "" });
    expect(run.stderr).toContain('settings file "none.json" does not exist');
  });
});
