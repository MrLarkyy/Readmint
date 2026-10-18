import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildExamples,
  compareExamples,
  defaultActionRef,
  profileExampleProps,
  runExamples,
  writeExamples,
  type ExampleFile,
  type ExamplesOptions,
} from "../src/index.js";

const templatesDir = fileURLToPath(new URL("../../components/templates/", import.meta.url));
const profilesDir = join(templatesDir, "profiles");
const options: ExamplesOptions = {
  login: "octo",
  actionRef: "owner/action@v9.9.9",
  props: profileExampleProps,
};

const temporary: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "readmint-examples-"));
  temporary.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const text = (files: readonly ExampleFile[], path: string): string => {
  const file = files.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`no ${path}`);
  return file.content.toString();
};
const templates = readdirSync(profilesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("buildExamples over the real templates", () => {
  const files = buildExamples(templatesDir, options);

  it("has a folder per template with every design, renders.json and no dark twin", () => {
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      const designs = readdirSync(join(profilesDir, template)).filter(
        (f) => f.endsWith(".json") && f !== "settings.json",
      );
      expect(designs).toContain("renders.json");
      for (const design of designs) {
        expect(
          files.map((f) => f.path),
          design,
        ).toContain(`${template}/designs/${design}`);
        expect(design).not.toMatch(/\.dark\.json$/u);
      }
      expect(files.map((f) => f.path)).toContain(`${template}/README.md`);
    }
  });

  it("copies every design byte for byte from the template folder", () => {
    for (const template of templates) {
      for (const design of readdirSync(join(profilesDir, template)).filter(
        (f) => f.endsWith(".json") && f !== "settings.json",
      )) {
        const copy = files.find((f) => f.path === `${template}/designs/${design}`)?.content;
        const original = readFileSync(join(profilesDir, template, design));
        expect(Buffer.from(copy ?? "").equals(original), `${template}/${design}`).toBe(true);
      }
    }
  });

  it("writes designs/settings.json with the personal texts, only for templates with props", () => {
    for (const template of templates) {
      const path = `${template}/designs/settings.json`;
      const props = profileExampleProps[template];
      if (props === undefined || Object.keys(props).length === 0) {
        expect(
          files.map((f) => f.path),
          template,
        ).not.toContain(path);
        continue;
      }
      const content = text(files, path);
      expect(JSON.parse(content)).toEqual(props);
      expect(content).toBe(`${JSON.stringify(props, null, 2)}\n`);
      for (const section of Object.keys(JSON.parse(content) as object)) {
        const paths = files.map((f) => f.path);
        const renders = JSON.parse(text(files, `${template}/designs/renders.json`)) as {
          renders: { name: string; design: string }[];
        };
        const render = renders.renders.find((entry) => entry.name === section);
        expect(render, `${template}/${section}`).toBeDefined();
        expect(paths, `${template}/${section}`).toContain(
          `${template}/designs/${render?.design ?? ""}`,
        );
      }
    }
  });

  it("passes props-file in the workflow step of the templates with settings", () => {
    const workflow = text(files, ".github/workflows/readmint.yml");
    for (const template of templates) {
      const line = `          props-file: ${template}/designs/settings.json\n`;
      if (files.some((f) => f.path === `${template}/designs/settings.json`)) {
        expect(workflow, template).toContain(line);
      } else {
        expect(workflow, template).not.toContain(line);
      }
    }
  });

  it("renders the manifest of every template in the workflow, with the given action", () => {
    const workflow = text(files, ".github/workflows/readmint.yml");
    expect(workflow).toContain("uses: owner/action@v9.9.9");
    expect(workflow).not.toContain(".dark.json");
    expect(workflow).not.toContain("designs: |");
    for (const template of templates) {
      expect(workflow).toContain(`output-dir: ${template}/readmint`);
      expect(workflow).toContain(`          manifest: ${template}/designs/renders.json
`);
    }
  });

  it("fills in the login and leaves no placeholder in any README", () => {
    for (const file of files.filter(
      (f) => f.path.endsWith("README.md") && !f.path.includes("fonts"),
    )) {
      expect(file.content.toString(), file.path).not.toContain("YOUR-");
    }
    for (const template of templates) {
      expect(text(files, `${template}/README.md`)).toContain("https://github.com/octo");
    }
    expect(text(files, "README.md")).toContain("`v9.9.9`");
  });

  it("links no README to a docs/ file of the repository", () => {
    for (const file of files.filter((f) => f.path.endsWith("README.md"))) {
      const content = file.content.toString();
      expect(content, file.path).not.toContain("](docs/");
      expect(content, file.path).not.toMatch(/[/]docs[/][^ )]*[.]md/);
    }
  });

  it("copies the fonts and their licences byte for byte", () => {
    for (const template of templates) {
      for (const name of readdirSync(join(profilesDir, template, "fonts"))) {
        const copy = files.find((f) => f.path === `${template}/designs/fonts/${name}`);
        const original = readFileSync(join(profilesDir, template, "fonts", name));
        expect(Buffer.from(copy?.content ?? "").equals(original), name).toBe(true);
      }
    }
  });

  it("uses POSIX paths, sorted, and is deterministic", () => {
    expect(files.every((f) => !f.path.includes("\\"))).toBe(true);
    const paths = files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
    const again = buildExamples(templatesDir, options);
    expect(again.map((f) => f.path)).toEqual(paths);
    expect(
      again.every((f, i) => Buffer.from(f.content).equals(Buffer.from(files[i]?.content ?? ""))),
    ).toBe(true);
  });
});

describe("buildExamples on a broken template folder", () => {
  function fixture(design: object, extra: Record<string, string> = {}): string {
    const dir = temp();
    const template = join(dir, "profiles", "t");
    mkdirSync(template, { recursive: true });
    writeFileSync(join(template, "README.md"), "# T\n\n## The README\n\n```html\n<img>\n```\n");
    writeFileSync(join(template, "a.json"), JSON.stringify(design));
    writeFileSync(
      join(template, "renders.json"),
      JSON.stringify({ renders: [{ name: "a", design: "a.json", variants: ["dark"] }] }),
    );
    for (const [name, content] of Object.entries(extra))
      writeFileSync(join(template, name), content);
    return dir;
  }
  const component = { layers: [{ type: "component", ref: "r", props: {} }] };

  it("builds when everything is in order", () => {
    const files = buildExamples(fixture(component), {
      ...options,
      props: { t: { a: { x: "1" } } },
    });
    expect(files.map((f) => f.path)).toContain("t/designs/renders.json");
    expect(files.map((f) => f.path)).not.toContain("t/designs/a.dark.json");
  });

  it("does not treat the template's own settings.json as a design", () => {
    const files = buildExamples(fixture(component, { "settings.json": '{"a":{"x":""}}' }), {
      ...options,
      props: { t: { a: { x: "1" } } },
    });
    expect(files.map((f) => f.path).filter((path) => path.includes("settings"))).toEqual([
      "t/designs/settings.json",
    ]);
    expect(text(files, "t/designs/settings.json")).toBe('{\n  "a": {\n    "x": "1"\n  }\n}\n');
    const bare = buildExamples(fixture(component, { "settings.json": "{}" }), {
      ...options,
      props: {},
    });
    expect(bare.map((f) => f.path)).not.toContain("t/designs/settings.json");
  });

  it("refuses a pinned Action older than props-file when a settings.json is emitted", () => {
    const props = { t: { a: { x: "1" } } };
    expect(() =>
      buildExamples(fixture(component), { ...options, actionRef: "o/a@v0.2.0", props }),
    ).toThrow(/v0\.2\.0 predates props-file/);
    expect(
      buildExamples(fixture(component), { ...options, actionRef: "o/a@v0.4.0", props }),
    ).not.toHaveLength(0);
    expect(
      buildExamples(fixture(component), { ...options, actionRef: "o/a@main", props }),
    ).not.toHaveLength(0);
    expect(
      buildExamples(fixture(component), { ...options, actionRef: "o/a@v0.4.0", props: {} }),
    ).not.toHaveLength(0);
  });

  it("throws on example props for a section without a design", () => {
    expect(() =>
      buildExamples(fixture(component), { ...options, props: { t: { b: { x: "1" } } } }),
    ).toThrow(/t\/b/);
  });

  it("throws on example props for a template that does not exist", () => {
    expect(() => buildExamples(fixture(component), { ...options, props: { gone: {} } })).toThrow(
      /gone/,
    );
  });

  it("throws when a design is listed by no render", () => {
    const dir = fixture(component, { "b.json": "{}" });
    expect(() => buildExamples(dir, { ...options, props: {} })).toThrow(
      /b\.json is listed by no render/,
    );
  });

  it("throws when a render names a missing design or the manifest is missing or invalid", () => {
    const missing = fixture(component, {
      "renders.json": JSON.stringify({ renders: [{ name: "a", design: "gone.json" }] }),
    });
    expect(() => buildExamples(missing, { ...options, props: {} })).toThrow(/no design file/);
    const invalid = fixture(component, { "renders.json": "{" });
    expect(() => buildExamples(invalid, { ...options, props: {} })).toThrow(
      /renders\.json does not validate/,
    );
    const dir = fixture(component);
    rmSync(join(dir, "profiles", "t", "renders.json"));
    expect(() => buildExamples(dir, { ...options, props: {} })).toThrow(/t: no renders[.]json/);
  });

  it("refuses a pinned Action older than manifest, accepts v0.4.0 and @main", () => {
    expect(() =>
      buildExamples(fixture(component), { ...options, actionRef: "o/a@v0.3.0", props: {} }),
    ).toThrow(/v0[.]3[.]0 predates manifest [(]Action v0[.]4[.]0[)]/);
    for (const actionRef of ["o/a@v0.4.0", "o/a@main"]) {
      expect(
        buildExamples(fixture(component), { ...options, actionRef, props: {} }),
      ).not.toHaveLength(0);
    }
  });

  it("has a workflow step with manifest and props-file, no designs list", () => {
    const files = buildExamples(fixture(component), {
      ...options,
      props: { t: { a: { x: "1" } } },
    });
    const workflow = text(files, ".github/workflows/readmint.yml");
    expect(workflow).toContain("          manifest: t/designs/renders.json\n");
    expect(workflow).toContain("          props-file: t/designs/settings.json\n");
    expect(workflow).not.toContain("designs: |");
  });
});

describe("writeExamples and compareExamples", () => {
  const files = buildExamples(templatesDir, options);
  const template = templates[0] ?? "";

  it("is in sync right after writing", () => {
    const out = temp();
    writeExamples(out, files);
    expect(compareExamples(out, files)).toEqual([]);
  });

  it("reports a changed design, a missing file and a stale file, and ignores readmint/", () => {
    const out = temp();
    writeExamples(out, files);
    writeFileSync(join(out, template, "designs", "header.json"), "{}\n");
    writeFileSync(join(out, template, "designs", "stale.json"), "{}\n");
    rmSync(join(out, "README.md"));
    mkdirSync(join(out, template, "readmint"), { recursive: true });
    writeFileSync(join(out, template, "readmint", "x.svg"), "<svg/>");
    expect(compareExamples(out, files)).toEqual([
      { path: "README.md", kind: "missing" },
      { path: `${template}/designs/header.json`, kind: "differs" },
      { path: `${template}/designs/stale.json`, kind: "stale" },
    ]);
  });

  it("removes stale generated files, also of a vanished template, and keeps readmint/ and .git", () => {
    const out = temp();
    writeExamples(out, files);
    writeFileSync(join(out, template, "designs", "stale.json"), "{}\n");
    mkdirSync(join(out, "old", "designs"), { recursive: true });
    mkdirSync(join(out, "old", "readmint"), { recursive: true });
    writeFileSync(join(out, "old", "designs", "a.json"), "{}\n");
    writeFileSync(join(out, "old", "README.md"), "# old\n");
    writeFileSync(join(out, "old", "readmint", "x.svg"), "<svg/>");
    mkdirSync(join(out, ".git"));
    writeFileSync(join(out, ".git", "config"), "keep");
    writeFileSync(join(out, "NOTES.md"), "mine");
    const { removed } = writeExamples(out, files);
    expect(removed).toEqual(
      ["old/README.md", "old/designs/a.json", `${template}/designs/stale.json`].sort(),
    );
    expect(readFileSync(join(out, "old", "readmint", "x.svg"), "utf8")).toBe("<svg/>");
    expect(readFileSync(join(out, ".git", "config"), "utf8")).toBe("keep");
    expect(readFileSync(join(out, "NOTES.md"), "utf8")).toBe("mine");
    expect(compareExamples(out, files)).toEqual([]);
  });
});

describe("symbolic links", () => {
  function link(target: string, path: string): boolean {
    try {
      symlinkSync(target, path, "junction");
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
      throw error;
    }
  }
  const files = buildExamples(templatesDir, options);
  const template = templates[0] ?? "";

  it("refuses a designs folder that links elsewhere and deletes nothing", () => {
    const out = temp();
    const sibling = join(out, "sibling");
    mkdirSync(join(out, template), { recursive: true });
    mkdirSync(sibling);
    writeFileSync(join(sibling, "keep.json"), "{}");
    if (!link(sibling, join(out, template, "designs"))) return;
    expect(() => writeExamples(out, files)).toThrow(/symbolic link/);
    expect(() => compareExamples(out, files)).toThrow(/symbolic link/);
    expect(readFileSync(join(sibling, "keep.json"), "utf8")).toBe("{}");
  });

  it("refuses a link inside a template folder", () => {
    const dir = temp();
    cpSync(templatesDir, dir, { recursive: true });
    const target = join(dir, "outside");
    mkdirSync(target);
    if (!link(target, join(dir, "profiles", template, "fonts", "x"))) return;
    expect(() => buildExamples(dir, options)).toThrow(/symbolic link/);
  });
});

describe("runExamples", () => {
  function run(...argv: string[]): { code: number; out: string; err: string } {
    let out = "";
    let err = "";
    const code = runExamples(argv, {
      stdout: (text) => (out += text),
      stderr: (text) => (err += text),
    });
    return { code, out, err };
  }

  it.each([
    [[]],
    [[templatesDir]],
    [[templatesDir, "a", "b"]],
    [[templatesDir, "a", "--nope"]],
    [[templatesDir, "a", "--login"]],
  ])("answers %j with usage and exit 2", (argv) => {
    const { code, err } = run(...argv);
    expect(code).toBe(2);
    expect(err).toContain("usage: readmint-examples");
    expect(err).toContain(defaultActionRef);
  });

  // A fixed pin keeps these tests independent of the default, which every Action release bumps (docs/action.md#releases).
  const pin = ["--action", options.actionRef];

  it("writes, then reports in sync with exit 0", () => {
    const out = temp();
    const written = run(templatesDir, out, ...pin);
    expect(written.code).toBe(0);
    expect(written.out).toMatch(/^wrote \d+ files to .*, removed 0\n$/);
    expect(run(templatesDir, out, "--check", ...pin)).toEqual({
      code: 0,
      out: "the examples repository is in sync\n",
      err: "",
    });
  });

  it("lists missing, differing and stale files with --check and exits 1", () => {
    const out = temp();
    run(templatesDir, out, ...pin);
    const template = templates[0] ?? "";
    rmSync(join(out, "README.md"));
    writeFileSync(join(out, template, "designs", "header.json"), "{}\n");
    writeFileSync(join(out, template, "designs", "stale.json"), "{}\n");
    const { code, out: lines, err } = run(templatesDir, out, "--check", ...pin);
    expect(code).toBe(1);
    expect(lines).toBe(
      `missing: README.md\ndiffers: ${template}/designs/header.json\nstale: ${template}/designs/stale.json\n`,
    );
    expect(err).toContain("3 files out of sync");
  });

  it("writes the pinned default Action reference without --action", () => {
    expect(defaultActionRef).toBe("MrLarkyy/Readmint@v0.4.0");
    // The templates as the pinned release accepts them: without the filters it predates (exclude, sum: v0.5.0).
    const dir = temp();
    cpSync(templatesDir, dir, { recursive: true });
    const profiles = join(dir, "profiles");
    for (const folder of readdirSync(profiles, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    )) {
      const root = join(profiles, folder.name);
      for (const file of readdirSync(root).filter((name) => name.endsWith(".json"))) {
        const text = readFileSync(join(root, file), "utf8");
        const stripped = withoutNewFilters(text);
        if (stripped !== text) writeFileSync(join(root, file), stripped);
      }
    }
    const out = temp();
    expect(run(dir, out).code).toBe(0);
    const workflow = readFileSync(join(out, ".github", "workflows", "readmint.yml"), "utf8");
    expect(workflow).toContain(`uses: ${defaultActionRef}`);
  });

  it("refuses the default pin over the real templates until the release that brings exclude and sum", () => {
    const { code, err } = run(templatesDir, temp());
    expect(code).toBe(1);
    expect(err).toMatch(
      /@v0\.4\.0 predates (exclude|sum) \(Action v0\.5\.0\), which (horizon|pinscreen|year-ring)\/[a-z0-9-]+(\.dark)?\.json uses/,
    );
  });

  it("refuses an Action pin older than the layer properties the real templates use", () => {
    const { code, err } = run(templatesDir, temp(), "--action", "MrLarkyy/Readmint@v0.3.0");
    expect(code).toBe(1);
    expect(err).toMatch(
      /@v0\.3\.0 predates (maxLines|let|orbit|palette) \(Action v0\.4\.0\), which (horizon|pinscreen|year-ring)\/[a-z0-9-]+(\.dark)?\.json uses/,
    );
  });

  it("reports a failure as exit 1 with its message", () => {
    const { code, err } = run(join(templatesDir, "nowhere"), temp());
    expect(code).toBe(1);
    expect(err).toContain("nowhere");
  });
});

/** A design text without its `| exclude(...)` and `| sum(...)` pipes; the generator copies texts, it never evaluates them. */
function withoutNewFilters(text: string): string {
  return text.replace(/\s*\|\s*(?:exclude|sum)\b(?:\([^()]*\))?/g, "");
}
