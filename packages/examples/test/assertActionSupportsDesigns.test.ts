import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assertActionSupportsDesigns } from "../src/assertActionSupportsDesigns.js";
import { buildExamples, profileExampleProps, runExamples } from "../src/index.js";

const templatesDir = fileURLToPath(new URL("../../components/templates/", import.meta.url));
const temporary: string[] = [];
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "readmint-required-"));
  temporary.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const design = (text: string) => [{ file: "t/header.json", text }];
const piped = '{"a": "{{ x | truncateWidth(\\"reg\\", 10) }}"}';

describe("assertActionSupportsDesigns", () => {
  it("throws for a pinned release older than a used filter", () => {
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.2.0", design(piped));
    }).toThrow(
      "owner/action@v0.2.0 predates truncateWidth (Action v0.3.0), which t/header.json uses; pin v0.3.0 or newer",
    );
  });

  it.each(["@v0.3.0", "@v9.9.9", "@v0.10.0", "@main", "@v0", "@6da04fa"])("accepts %s", (ref) => {
    expect(() => {
      assertActionSupportsDesigns(`owner/action${ref}`, design(piped));
    }).not.toThrow();
  });

  it("ignores the word outside a pipe", () => {
    expect(() => {
      assertActionSupportsDesigns(
        "owner/action@v0.1.0",
        design('{"textWidth": 3, "truncateWidth": 4}'),
      );
    }).not.toThrow();
  });
});

describe("the examples generator", () => {
  it("rejects an older Action over the real templates", () => {
    expect(() =>
      buildExamples(templatesDir, {
        login: "octo",
        actionRef: "owner/action@v0.2.0",
        props: profileExampleProps,
      }),
    ).toThrow(/textWidth|truncateWidth/);
  });

  it("detects a filter in a synthetic template", () => {
    const dir = temp();
    const template = join(dir, "profiles", "demo");
    mkdirSync(template, { recursive: true });
    writeFileSync(join(template, "README.md"), "# Demo\n\n## The README\n\n```html\n<img>\n```\n");
    const body =
      '{"layers":[{"type":"component","props":{"t":"{{ a | truncateWidth(\\"reg\\", 1) }}"}}]}\n';
    writeFileSync(join(template, "a.json"), body);
    writeFileSync(join(template, "a.dark.json"), body);
    const options = { login: "octo", actionRef: "owner/action@v0.2.0", props: {} };
    expect(() => buildExamples(dir, options)).toThrow(/truncateWidth.*demo\/a(\.dark)?\.json/);
    expect(() =>
      buildExamples(dir, { ...options, actionRef: "owner/action@v0.3.0" }),
    ).not.toThrow();
  });

  it("fails runExamples --check with exit 1 and the message", () => {
    let err = "";
    const code = runExamples([templatesDir, temp(), "--check", "--action", "owner/action@v0.2.0"], {
      stdout: () => undefined,
      stderr: (text) => (err += text),
    });
    expect(code).toBe(1);
    expect(err).toContain("pin v0.3.0 or newer");
  });
});
