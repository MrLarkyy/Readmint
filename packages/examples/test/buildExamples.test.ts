import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildExamples,
  compareExamples,
  profileExampleProps,
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

  it("has a folder per template with every design and a dark twin of each light design", () => {
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      const designs = readdirSync(join(profilesDir, template)).filter((f) => f.endsWith(".json"));
      for (const design of designs) {
        expect(
          files.map((f) => f.path),
          design,
        ).toContain(`${template}/designs/${design}`);
        if (!design.endsWith(".dark.json")) {
          expect(designs).toContain(design.replace(/\.json$/, ".dark.json"));
        }
      }
      expect(files.map((f) => f.path)).toContain(`${template}/README.md`);
    }
  });

  it("merges the personal texts into the root props of the light and the dark design", () => {
    for (const [template, sections] of Object.entries(profileExampleProps)) {
      for (const [section, props] of Object.entries(sections)) {
        const [name, value] = Object.entries(props)[0] ?? [];
        for (const file of [`${section}.json`, `${section}.dark.json`]) {
          const design = JSON.parse(text(files, `${template}/designs/${file}`)) as {
            layers: { props: Record<string, unknown> }[];
          };
          expect(design.layers[0]?.props[String(name)], `${template}/${file}`).toEqual(value);
        }
      }
    }
  });

  it("leaves a design without personal texts as the template file", () => {
    const original = readFileSync(join(profilesDir, "horizon", "repo-1.json"));
    const copy = files.find((f) => f.path === "horizon/designs/repo-1.json")?.content;
    expect(Buffer.from(copy ?? "").equals(original)).toBe(true);
  });

  it("lists every light design of every template in the workflow, with the given action", () => {
    const workflow = text(files, ".github/workflows/readmint.yml");
    expect(workflow).toContain("uses: owner/action@v9.9.9");
    expect(workflow).not.toContain(".dark.json");
    for (const template of templates) {
      expect(workflow).toContain(`output-dir: ${template}/readmint`);
      for (const design of readdirSync(join(profilesDir, template))) {
        if (design.endsWith(".json") && !design.endsWith(".dark.json")) {
          expect(workflow).toContain(`            ${template}/designs/${design}\n`);
        }
      }
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
    writeFileSync(join(template, "a.dark.json"), JSON.stringify(design));
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
    expect(files.map((f) => f.path)).toContain("t/designs/a.dark.json");
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

  it("throws when the root layer is not a component", () => {
    const dir = fixture({ layers: [{ type: "rect" }] });
    expect(() => buildExamples(dir, { ...options, props: { t: { a: { x: "1" } } } })).toThrow(
      /a(\.dark)?\.json.*component/,
    );
  });

  it("throws when a light design has no dark twin", () => {
    const dir = fixture(component, { "b.json": "{}" });
    expect(() => buildExamples(dir, { ...options, props: {} })).toThrow(/b\.dark\.json/);
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
