import { runCli } from "@readmint/cli";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type ActionTree, CANARY, makeActionTree } from "./actionTree.js";

let tree: ActionTree;

const enumTheme = { type: "enum", values: ["light", "dark"], default: "light" };

/** A design whose root component takes the enum prop `theme` (written into the layer as `layer`). */
function themed(layer = "light", declared: object | null = enumTheme): object {
  return {
    version: 0,
    canvas: { width: 40, height: 24 },
    components: {
      box: {
        props: {
          ...(declared === null ? {} : { theme: declared }),
          w: { type: "number", default: 5 },
        },
        layers: [
          {
            type: "rect",
            width: "{{ props.w }}",
            height: "{{ stats.v }}",
            fill: '{{ props.theme == "dark" ? "#000000" : "#ffffff" }}',
          },
        ],
      },
    },
    layers: [
      {
        type: "component",
        ref: "box",
        ...(declared === null ? {} : { props: { theme: layer } }),
      },
    ],
  };
}

const dry = { designs: "card.json", "data-file": "data.json", "dry-run": "true" };

beforeEach(async () => {
  tree = await makeActionTree();
  await tree.file("card.json", themed());
  await tree.file("data.json", { stats: { v: 12 } });
});

afterEach(async () => {
  await tree.remove();
});

describe("the variant input", () => {
  test("without it the files and the snippet are those of a design without a twin", async () => {
    const run = await tree.run(dry);
    expect(run.code).toBe(0);
    expect(run.outputs.files).toBe("readmint/card.svg");
    expect(run.outputs.snippet).not.toContain("<source");
    expect(run.log).not.toContain("variant");
  });

  test("dark writes the dark file and the snippet gets its source", async () => {
    const run = await tree.run({ ...dry, variant: "dark" });
    expect(run.code).toBe(0);
    expect(run.outputs.files).toBe("readmint/card.svg\nreadmint/card.dark.svg");
    expect(run.outputs.snippet).toContain(
      '<source media="(prefers-color-scheme: dark)" srcset="readmint/card.dark.svg">',
    );
    expect(await tree.read("readmint/card.dark.svg")).not.toBe(
      await tree.read("readmint/card.svg"),
    );
  });

  test("the dark file equals the render of the twin that would exist", async () => {
    await tree.run({ ...dry, variant: "dark" });
    const variant = await tree.read("readmint/card.dark.svg");
    await tree.file("sub/card.json", themed("dark"));
    await tree.run({ designs: "sub/card.json", "data-file": "data.json", "dry-run": "true" });
    expect(await tree.read("readmint/card.svg")).toBe(variant);
  });

  test("equals the bytes of readmint render --variant dark", async () => {
    await tree.run({ ...dry, variant: "dark" });
    let stdout = "";
    const code = await runCli(["render", "card.json", "--variant", "dark", "--data", "data.json"], {
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => undefined,
      cwd: tree.root,
    });
    expect(code).toBe(0);
    expect(await tree.read("readmint/card.dark.svg")).toBe(stdout);
  });

  test("a twin next to the design wins, with an info line", async () => {
    await tree.file("card.dark.json", themed("light"));
    const run = await tree.run({ ...dry, variant: "dark" });
    expect(run.code).toBe(0);
    expect(run.log).toContain('"card.dark.json" next to "card.json" wins over the dark variant');
    // The twin's own light theme, not the variant's.
    expect(await tree.read("readmint/card.dark.svg")).toBe(await tree.read("readmint/card.svg"));
  });

  test("a design that does not declare the prop fails, told apart from the light render", async () => {
    await tree.file("card.json", themed("light", null));
    const run = await tree.run({ ...dry, variant: "dark" });
    expect(run.code).toBe(1);
    expect(run.log).toContain(
      'card.json (dark variant): error unknown-property at /theme: variant dark: no top-level component of the design has the prop "theme"',
    );
  });

  test("a design that does not load is reported once, not again for its variant", async () => {
    const missing = await tree.run({ ...dry, designs: "gone.json", variant: "dark" });
    expect(missing.code).toBe(1);
    expect(missing.log.match(/::error::/g)).toHaveLength(1);
    expect(missing.log).not.toContain("(dark variant)");
    await tree.file("card.json", "{ not json");
    const broken = await tree.run({ ...dry, variant: "dark" });
    expect(broken.code).toBe(1);
    expect(broken.log).not.toContain("(dark variant)");
  });

  test("an unknown name is an input error that does not echo it", async () => {
    const run = await tree.run({ ...dry, variant: "zzTOP" });
    expect(run.code).toBe(1);
    expect(run.log).toContain("input variant must be empty or one of: dark");
    expect(run.log).not.toContain("zzTOP");
  });

  test("the token and a settings value never reach the log", async () => {
    await tree.file("settings.json", { card: { theme: "light", w: "s3cret-word" } });
    const inputs = { ...dry, variant: "dark", token: CANARY, "props-file": "settings.json" };
    const failing = await tree.run(inputs);
    expect(failing.code).toBe(1);
    expect(failing.log).not.toContain("s3cret-word");
    expect(failing.log).not.toContain(CANARY);
    await tree.file("settings.json", { card: { theme: "light" } });
    const ok = await tree.run(inputs);
    expect(ok.code).toBe(0);
    expect(ok.log).toContain(
      'settings section "card" sets "theme", which overrides the dark variant',
    );
    expect(ok.log).not.toContain(CANARY);
  });
});
