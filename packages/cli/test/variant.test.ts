import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ExitCode } from "../src/index.js";
import { type CliTree, makeCliTree } from "./cliTree.js";

let tree: CliTree;

/** A design whose root component takes the enum prop `theme`; `layer` is the prop value written into the layer. */
function themed(layer: string | number = "light", declared: object | null = enumTheme): object {
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
            height: 10,
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

const enumTheme = { type: "enum", values: ["light", "dark"], default: "light" };

beforeEach(async () => {
  tree = await makeCliTree();
  await tree.file("card.json", themed());
});

afterEach(async () => {
  await tree.remove();
});

describe("render --variant dark", () => {
  test("renders the bytes of the twin with the literal dark, the same twice", async () => {
    await tree.file("written.json", themed("dark"));
    const first = await tree.run(["render", "card.json", "--variant", "dark"]);
    const again = await tree.run(["render", "card.json", "--variant", "dark"]);
    expect(first).toMatchObject({ code: ExitCode.ok, stderr: "" });
    expect(again.stdout).toBe(first.stdout);
    expect(first.stdout).toBe((await tree.run(["render", "written.json"])).stdout);
    expect(first.stdout).not.toBe((await tree.run(["render", "card.json"])).stdout);
  });

  test("a card.dark.json next to the design wins, with one stderr line", async () => {
    await tree.file("card.dark.json", {
      ...themed("dark"),
      canvas: { width: 41, height: 24 },
    });
    const run = await tree.run(["render", "card.json", "--variant", "dark"]);
    const twin = await tree.run(["render", "card.dark.json"]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stdout).toBe(twin.stdout);
    expect(run.stderr).toBe(
      'using "card.dark.json" next to "card.json" instead of the dark variant\n',
    );
  });

  test("a design that already is the twin is not applied twice or replaced", async () => {
    await tree.file("card.dark.json", themed("light"));
    const run = await tree.run(["render", "card.dark.json", "--variant", "dark"]);
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
    await tree.file("written.json", themed("dark"));
    expect(run.stdout).toBe((await tree.run(["render", "written.json"])).stdout);
  });

  test("a design without the prop fails with the name only", async () => {
    await tree.file("card.json", themed("light", null));
    const run = await tree.run(["render", "card.json", "--variant", "dark"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toBe(
      'card.json: error unknown-property at /theme: variant dark: no top-level component of the design has the prop "theme"\n',
    );
  });

  test("a prop of another type fails without the value", async () => {
    await tree.file("card.json", themed(1, { type: "number", default: 1 }));
    const run = await tree.run(["render", "card.json", "--variant", "dark"]);
    expect(run.code).toBe(ExitCode.invalid);
    expect(run.stderr).toBe(
      "card.json: error type at /theme: variant dark: the value has the wrong type for the prop\n",
    );
    expect(run.stderr).not.toContain('dark"');
  });

  test("a settings section that sets the prop wins and is warned about without the value", async () => {
    await tree.file("settings.json", { card: { theme: "light", w: 9 } });
    const run = await tree.run([
      "render",
      "card.json",
      "--variant",
      "dark",
      "--props",
      "settings.json",
    ]);
    expect(run.code).toBe(ExitCode.ok);
    expect(run.stderr).toBe(
      'card.json: settings section "card" sets "theme", which overrides the dark variant\n',
    );
    const plain = await tree.run(["render", "card.json", "--props", "settings.json"]);
    expect(run.stdout).toBe(plain.stdout);
  });

  test("other settings leave the variant: bytes equal the twin with the same settings", async () => {
    await tree.file("settings.json", { card: { w: 9 }, written: { w: 9 } });
    await tree.file("written.json", themed("dark"));
    const run = await tree.run([
      "render",
      "card.json",
      "--variant",
      "dark",
      "--props",
      "settings.json",
    ]);
    expect(run).toMatchObject({ code: ExitCode.ok, stderr: "" });
    const twin = await tree.run(["render", "written.json", "--props", "settings.json"]);
    expect(run.stdout).toBe(twin.stdout);
  });

  test("a personal settings value never reaches stderr when the render fails", async () => {
    await tree.file("settings.json", { card: { w: "s3cret-word" } });
    const run = await tree.run([
      "render",
      "card.json",
      "--variant",
      "dark",
      "--props",
      "settings.json",
    ]);
    expect(run.code).not.toBe(ExitCode.ok);
    expect(run.stderr).not.toContain("s3cret");
  });
});

describe("--variant arguments", () => {
  test("an unknown name is a usage error that does not echo it", async () => {
    const run = await tree.run(["render", "card.json", "--variant", "zzTOP"]);
    expect(run.code).toBe(ExitCode.usage);
    expect(run.stderr).toContain("--variant must be one of: dark");
    expect(run.stderr).not.toContain("zzTOP");
  });

  test.each(["validate", "preview"])("%s refuses the option", async (command) => {
    const run = await tree.run([command, "card.json", "--variant", "dark"]);
    expect(run.code).toBe(ExitCode.usage);
  });
});
