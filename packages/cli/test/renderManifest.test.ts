import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import { stripFontData } from "../../components/test/stripFontData.js";
import { ExitCode, runCli } from "../src/index.js";

const components = join(import.meta.dirname, "..", "..", "components");
const templates = join(components, "templates", "profiles");
const slots = [1, 2, 3, 4, 5, 6] as const;

const folders: string[] = [];
afterAll(async () => {
  await Promise.all(folders.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function run(cwd: string, argv: readonly string[]) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

async function copyTemplate(template: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "readmint-manifest-"));
  folders.push(folder);
  await cp(join(templates, template), folder, { recursive: true });
  await writeFile(join(folder, "data.json"), JSON.stringify(sampleProfileData()));
  return folder;
}

const repoManifest = {
  renders: slots.map((slot) => ({
    name: `repo-${String(slot)}`,
    design: "repo-1.json",
    props: { slot: slot - 1 },
    variants: ["dark"],
  })),
};

describe.each(["horizon", "pinscreen", "year-ring"])("%s repo-1..6 as one design", (template) => {
  test("six renders on repo-1.json write the bytes of repo-1..6, light and dark, the same twice", async () => {
    const folder = await copyTemplate(template);
    await writeFile(join(folder, "renders.json"), JSON.stringify(repoManifest));
    const base = ["--data", "data.json", "--props", "settings.json"];
    const manifest = ["render", "--manifest", "renders.json", "--out-dir", "out", ...base];

    const first = await run(folder, manifest);
    expect(first).toMatchObject({ code: ExitCode.ok, stderr: "" });
    const written = (await readdir(join(folder, "out"))).sort();
    expect(written).toEqual(
      slots.flatMap((slot) => [`repo-${String(slot)}.dark.svg`, `repo-${String(slot)}.svg`]).sort(),
    );

    for (const slot of slots) {
      const name = `repo-${String(slot)}`;
      for (const theme of ["light", "dark"] as const) {
        const file = theme === "dark" ? `${name}.dark` : name;
        const expected = await run(folder, ["render", `${file}.json`, ...base]);
        expect(expected.code).toBe(ExitCode.ok);
        const bytes = await readFile(join(folder, "out", `${file}.svg`), "utf8");
        expect(bytes).toBe(expected.stdout);
        const golden = readFileSync(
          join(components, "test", "golden", `profiles-${template}-svg`, `${name}-${theme}.svg`),
          "utf8",
        );
        expect(stripFontData(bytes)).toBe(golden);
      }
    }

    const before = await Promise.all(
      written.map((file) => readFile(join(folder, "out", file), "utf8")),
    );
    const second = await run(folder, manifest);
    expect(second.stdout).toBe(first.stdout);
    const after = await Promise.all(
      written.map((file) => readFile(join(folder, "out", file), "utf8")),
    );
    expect(after).toEqual(before);
  });
});

test("the snippet on stdout is built from the names", async () => {
  const folder = await copyTemplate("horizon");
  await writeFile(
    join(folder, "renders.json"),
    JSON.stringify({
      renders: [
        { name: "repo-1", design: "repo-1.json", props: { slot: 0 }, variants: ["dark"] },
        { name: "header", design: "header.json" },
      ],
    }),
  );
  const result = await run(folder, [
    "render",
    "--manifest",
    "renders.json",
    "--out-dir",
    "readmint/",
    "--data",
    "data.json",
  ]);
  expect(result).toMatchObject({ code: ExitCode.ok, stderr: "" });
  expect(result.stdout).toBe(
    [
      "<picture>",
      '  <source media="(prefers-color-scheme: dark)" srcset="readmint/repo-1.dark.svg">',
      '  <img alt="repo-1" src="readmint/repo-1.svg">',
      "</picture>",
      "<picture>",
      '  <img alt="header" src="readmint/header.svg">',
      "</picture>",
      "",
    ].join("\n"),
  );
});

describe("settings", () => {
  test("a section named after a render applies to that render only", async () => {
    const folder = await copyTemplate("horizon");
    await writeFile(
      join(folder, "renders.json"),
      JSON.stringify({
        renders: [
          { name: "repo-2", design: "repo-1.json", props: { slot: 1 }, variants: [] },
          { name: "repo-3", design: "repo-1.json", props: { slot: 2 }, variants: [] },
        ],
      }),
    );
    const plain = [
      "render",
      "--manifest",
      "renders.json",
      "--out-dir",
      "plain",
      "--data",
      "data.json",
    ];
    expect((await run(folder, plain)).code).toBe(ExitCode.ok);
    await writeFile(join(folder, "named.json"), JSON.stringify({ "repo-3": { theme: "dark" } }));
    const named = await run(folder, [
      ...plain.slice(0, 4),
      "named",
      "--data",
      "data.json",
      "--props",
      "named.json",
    ]);
    expect(named).toMatchObject({ code: ExitCode.ok, stderr: "" });
    expect(await readFile(join(folder, "named", "repo-2.svg"), "utf8")).toBe(
      await readFile(join(folder, "plain", "repo-2.svg"), "utf8"),
    );
    const dark = await run(folder, ["render", "repo-3.dark.json", "--data", "data.json"]);
    expect(await readFile(join(folder, "named", "repo-3.svg"), "utf8")).toBe(dark.stdout);
  });

  test("a manifest of the template's sections equals the per-file renders with the settings", async () => {
    const folder = await copyTemplate("horizon");
    const sections = ["header", "footer", "stack", "worked"];
    await writeFile(
      join(folder, "renders.json"),
      JSON.stringify({
        renders: sections.map((name) => ({ name, design: `${name}.json`, variants: ["dark"] })),
      }),
    );
    const base = ["--data", "data.json", "--props", "settings.json"];
    const made = await run(folder, [
      "render",
      "--manifest",
      "renders.json",
      "--out-dir",
      "o",
      ...base,
    ]);
    expect(made).toMatchObject({ code: ExitCode.ok, stderr: "" });
    for (const name of sections) {
      for (const file of [name, `${name}.dark`]) {
        const single = await run(folder, ["render", `${file}.json`, ...base]);
        expect(await readFile(join(folder, "o", `${file}.svg`), "utf8")).toBe(single.stdout);
      }
    }
  });

  test("a section that overrides a render prop is warned about by name, not by value", async () => {
    const folder = await copyTemplate("horizon");
    await writeFile(
      join(folder, "renders.json"),
      JSON.stringify({
        renders: [{ name: "repo-2", design: "repo-1.json", props: { slot: 1 }, variants: [] }],
      }),
    );
    await writeFile(join(folder, "s.json"), JSON.stringify({ "repo-2": { slot: 4 } }));
    const result = await run(folder, [
      "render",
      "--manifest",
      "renders.json",
      "--out-dir",
      "o",
      "--data",
      "data.json",
      "--props",
      "s.json",
    ]);
    expect(result.code).toBe(ExitCode.ok);
    expect(result.stderr).toBe(
      'repo-1.json (render "repo-2"): settings section "repo-2" sets "slot", which overrides the props of render "repo-2"\n',
    );
  });
});

describe("failures", () => {
  async function failing(manifest: unknown, extra: readonly string[] = []) {
    const folder = await copyTemplate("horizon");
    await writeFile(join(folder, "renders.json"), JSON.stringify(manifest));
    const result = await run(folder, [
      "render",
      "--manifest",
      "renders.json",
      "--out-dir",
      "out",
      "--data",
      "data.json",
      ...extra,
    ]);
    const written = await readdir(folder);
    return { folder, result, written };
  }

  test("an unknown design is exit 3 with the pointer, nothing is written", async () => {
    const { result, written } = await failing({
      renders: [
        { name: "a", design: "header.json" },
        { name: "b", design: "missing.json" },
      ],
    });
    expect(result.code).toBe(ExitCode.input);
    expect(result.stderr).toBe(
      'manifest "renders.json": error unknown-reference at /renders/1/design: design file "missing.json" does not exist\n',
    );
    expect(written).not.toContain("out");
  });

  test("a parent segment is exit 1 with the pointer and no value", async () => {
    const { result } = await failing({
      renders: [{ name: "a", design: "../header.json", props: { text: "V4LUE-SENTINEL" } }],
    });
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr).toContain('manifest "renders.json": error pattern at /renders/0/design');
    expect(result.stderr).not.toContain("V4LUE-SENTINEL");
  });

  test("a bad prop value fails at the render and never shows the value", async () => {
    const { result, written } = await failing({
      renders: [
        { name: "ok", design: "repo-1.json", props: { slot: 1 } },
        { name: "bad", design: "repo-1.json", props: { slot: "V4LUE-SENTINEL" } },
      ],
    });
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr).toContain('manifest "renders.json": error');
    expect(result.stderr).toContain("/renders/1/props");
    expect(result.stderr).not.toContain("V4LUE-SENTINEL");
    expect(written).not.toContain("out");
  });

  test("one failing entry writes no file and every problem is listed", async () => {
    const { result, written } = await failing({
      renders: [
        { name: "a", design: "repo-1.json", props: { slot: 1 } },
        { name: "b", design: "repo-1.json", props: { nope: 1 } },
        { name: "c", design: "repo-1.json", props: { alsoNope: 1 } },
      ],
    });
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr.trim().split("\n").length).toBeGreaterThanOrEqual(2);
    expect(written).not.toContain("out");
  });

  test("a duplicate name, letter case ignored, is exit 1", async () => {
    const { result } = await failing({
      renders: [
        { name: "Repo", design: "repo-1.json" },
        { name: "repo", design: "repo-1.json" },
      ],
    });
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr).toContain("error duplicate-name at /renders/1/name");
  });

  test("the run variant clashing with a render prop is refused", async () => {
    const { result } = await failing(
      { renders: [{ name: "a", design: "repo-1.json", props: { theme: "dark" } }] },
      ["--variant", "dark"],
    );
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr).toContain("error duplicate-key at /renders/0/props/theme");
  });

  test("the run variant applies to a render without variants", async () => {
    const { folder, result } = await failing(
      { renders: [{ name: "a", design: "repo-1.json", props: { slot: 0 } }] },
      ["--variant", "dark"],
    );
    expect(result.code).toBe(ExitCode.ok);
    expect(await readdir(join(folder, "out"))).toEqual(["a.dark.svg", "a.svg"]);
  });

  test("a missing manifest is exit 3", async () => {
    const folder = await copyTemplate("horizon");
    const result = await run(folder, ["render", "--manifest", "none.json", "--out-dir", "o"]);
    expect(result.code).toBe(ExitCode.input);
  });
});

describe("usage", () => {
  test.each([
    [["render", "--manifest", "m.json"], "needs --out-dir"],
    [["render", "d.json", "--manifest", "m.json", "--out-dir", "o"], "takes no design file"],
    [
      ["render", "--manifest", "m.json", "--out-dir", "o", "--out", "x.svg"],
      "--out does not apply",
    ],
    [["render", "--manifest", "m.json", "--out-dir", "o", "--root", "r"], "--root does not apply"],
    [["render", "d.json", "--out-dir", "o"], "--out-dir needs --manifest"],
    [["validate", "--manifest", "m.json"], "--manifest does not apply to validate"],
    [["preview", "d.json", "--manifest", "m.json"], "--manifest does not apply to preview"],
    [["validate", "d.json", "--out-dir", "o"], "--out-dir does not apply to validate"],
  ])("%j is exit 2", async (argv, text) => {
    const result = await run(tmpdir(), argv);
    expect(result.code).toBe(ExitCode.usage);
    expect(result.stderr).toContain(text);
  });
});

describe("labels and repeated failures", () => {
  const plain = {
    version: 0,
    canvas: { width: 20, height: 10 },
    layers: [{ type: "rect", width: 10, height: 10, fill: "#1a7f37" }],
  };

  test("a manifest in a subfolder names the design relative to it, in every message", async () => {
    const folder = await copyTemplate("horizon");
    await mkdir(join(folder, "sub"));
    await writeFile(join(folder, "sub", "card.json"), JSON.stringify(plain));
    await writeFile(
      join(folder, "sub", "renders.json"),
      JSON.stringify({ renders: [{ name: "a", design: "card.json", variants: ["dark"] }] }),
    );
    const result = await run(folder, [
      "render",
      "--manifest",
      "sub/renders.json",
      "--out-dir",
      "o",
    ]);
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr).toBe(
      'card.json (render "a", dark variant): error unknown-property at /: variant dark: the design has no top-level component layer\n',
    );
  });

  test("a load failure is printed once, not for every variant", async () => {
    const folder = await copyTemplate("horizon");
    await writeFile(
      join(folder, "renders.json"),
      JSON.stringify({
        renders: [
          { name: "a", design: "repo-1.json", props: { slotz: 1 }, variants: ["dark"] },
          { name: "b", design: "repo-1.json", props: { slotz: 2 } },
        ],
      }),
    );
    const result = await run(folder, ["render", "--manifest", "renders.json", "--out-dir", "o"]);
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr.trim().split("\n")).toEqual([
      'manifest "renders.json": error unknown-property at /renders/0/props/slotz: no top-level component of the design has the prop "slotz"',
      'manifest "renders.json": error unknown-property at /renders/1/props/slotz: no top-level component of the design has the prop "slotz"',
    ]);
  });

  test("the run variant clash is refused before any data is loaded", async () => {
    const folder = await copyTemplate("horizon");
    await writeFile(
      join(folder, "renders.json"),
      JSON.stringify({
        renders: [{ name: "a", design: "repo-1.json", props: { theme: "light" } }],
      }),
    );
    const result = await run(folder, [
      "render",
      "--manifest",
      "renders.json",
      "--out-dir",
      "o",
      "--variant",
      "dark",
      "--data",
      "missing-data.json",
    ]);
    expect(result.code).toBe(ExitCode.invalid);
    expect(result.stderr).toContain("error duplicate-key at /renders/0/props/theme");
  });
});
