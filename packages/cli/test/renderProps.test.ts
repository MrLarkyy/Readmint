import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { type CliTree, makeCliTree, propsDesign } from "./cliTree.js";

let tree: CliTree;

/** A component whose string prop is a child rect's fill and whose number prop its width: the props' own types accept any. */
function childDesign(): object {
  return {
    version: 0,
    canvas: { width: 40, height: 24 },
    components: {
      box: {
        props: {
          paint: { type: "string", default: "#0969da" },
          size: { type: "number", default: 5 },
        },
        layers: [
          { type: "rect", width: "{{ props.size }}", height: 10, fill: "{{ props.paint }}" },
        ],
      },
    },
    layers: [{ type: "component", ref: "box" }],
  };
}

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("d.json", { v: 1 });
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

  test("render and validate name the section and prop of a wrong value, never the value", async () => {
    await tree.file("settings.json", { box: { w: "s3cret-word" } });
    for (const command of ["render", "validate"]) {
      const run = await tree.run([command, "box.json", "--props", "settings.json"]);
      expect(run).toMatchObject({ code: ExitCode.invalid, stdout: "" });
      expect(run.stderr).toContain("box.json: error type at /box/w:");
      expect(run.stderr).not.toContain("s3cret-word");
    }
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

  test("a bad binding in a value fails the render without quoting the value", async () => {
    await tree.file("settings.json", { box: { tone: "{{ 1 + s3cret }}" } });
    for (const command of ["render", "validate"]) {
      const run = await tree.run([
        command,
        "box.json",
        "--props",
        "settings.json",
        "--data",
        "d.json",
      ]);
      expect(run.code).toBe(ExitCode.invalid);
      expect(run.stderr).toContain(
        'box.json: error binding at /layers/0/props/tone: a value of settings section "box" (prop "tone")',
      );
      expect(run.stderr).not.toContain("s3cret");
      expect(run.stderr).not.toContain("1 +");
    }
  });

  test("an unfinished binding as a value is never printed", async () => {
    await tree.file("settings.json", { box: { tone: "{{ 1 + }}" } });
    for (const command of ["render", "validate"]) {
      const run = await tree.run([
        command,
        "box.json",
        "--props",
        "settings.json",
        "--data",
        "d.json",
      ]);
      expect(run.code).toBe(ExitCode.invalid);
      expect(run.stderr).toContain('settings section "box" (prop "tone")');
      expect(run.stderr).not.toContain("{{ 1 +");
    }
  });

  test("a value valid for its prop that breaks a child layer is not echoed at the child's path", async () => {
    await tree.file("child.json", childDesign());
    for (const [settings, secret] of [
      [{ child: { paint: "not-a-s3cret-colour" } }, "s3cret"],
      [{ child: { size: -98765 } }, "98765"],
    ] as const) {
      await tree.file("settings.json", settings);
      for (const command of ["render", "validate"]) {
        const run = await tree.run([
          command,
          "child.json",
          "--props",
          "settings.json",
          "--data",
          "d.json",
        ]);
        expect(run).toMatchObject({ code: ExitCode.invalid, stdout: "" });
        expect(run.stderr).toMatch(
          /^child\.json: error \w+ at \/components\/box\/layers\/0\/\w+: a value of settings section "child" \(prop "(paint|size)"\)/,
        );
        expect(run.stderr).not.toContain(secret);
      }
    }
  });

  test("a missing settings file is an input error", async () => {
    const run = await tree.run(["render", "box.json", "--props", "none.json"]);
    expect(run).toMatchObject({ code: ExitCode.input, stdout: "" });
    expect(run.stderr).toContain('settings file "none.json" does not exist');
  });
});
