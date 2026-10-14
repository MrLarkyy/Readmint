import { describe, expect, test } from "vitest";
import { DesignLimits, parseDesign } from "../src/index.js";
import { parseDesignSource } from "../src/parseDesignSource.js";

const minimalYaml = "version: 0\ncanvas: { width: 10, height: 10 }\nlayers: []\n";
const minimalJson = '{"version": 0, "canvas": {"width": 10, "height": 10}, "layers": []}';

function issuesOf(source: string, format?: "json" | "yaml") {
  const result = parseDesign(source, format === undefined ? {} : { format });
  if (result.ok) throw new Error("expected issues");
  return result.issues;
}

describe("JSON source", () => {
  test("a syntax error is a parse issue with line and column", () => {
    expect(issuesOf('{\n  "version": 0,\n  "canvas" x\n}')).toEqual([
      { path: "", code: "parse", message: "invalid JSON: expected ':'", line: 3, column: 12 },
    ]);
    expect(issuesOf('{"version": 0,')).toMatchObject([
      { code: "parse", message: "invalid JSON: unexpected end of input", line: 1, column: 15 },
    ]);
  });

  test("strict syntax: comments, trailing commas, single quotes and NaN are rejected", () => {
    for (const source of [
      '{"version": 0, // note\n}',
      '{"version": 0,}',
      "{'version': 0}",
      '{"version": NaN}',
      '{"version": 01}',
      '{"a": "tab\there"}',
    ])
      expect(issuesOf(source)[0]?.code, source).toBe("parse");
  });

  test("duplicate keys are reported, also when spelled with escapes", () => {
    expect(issuesOf('{"version": 0,\n "version": 0}')).toEqual([
      { path: "", code: "duplicate-key", message: 'duplicate key "version"', line: 2, column: 2 },
    ]);
    expect(issuesOf('{"a": 1, "\\u0061": 2}')).toMatchObject([{ code: "duplicate-key" }]);
  });

  test("deep nesting stops at the limit without a RangeError", () => {
    const deep = `${'{"a":'.repeat(10_000)}1${"}".repeat(10_000)}`;
    expect(issuesOf(deep)).toMatchObject([{ code: "too-deep", line: 1 }]);
    expect(issuesOf("[".repeat(10_000), "json")).toMatchObject([{ code: "too-deep" }]);
  });

  test("a byte order mark is accepted", () => {
    expect(parseDesign(`\ufeff${minimalJson}`).ok).toBe(true);
  });
});

describe("YAML source", () => {
  test("is read as YAML 1.2 core: yes stays a string", () => {
    const source = `${minimalYaml.replace("layers: []", "layers:")}  - { type: rect, width: 1, height: 1, visible: yes }\n`;
    expect(issuesOf(source)).toMatchObject([{ path: "/layers/0/visible", code: "type" }]);
    expect(parseDesignSource("a: yes\nb: on\nc: 012\n")).toEqual({
      ok: true,
      value: { a: "yes", b: "on", c: 12 },
    });
  });

  test("duplicate keys are reported with line and column, in document order", () => {
    expect(issuesOf("version: 0\nlayers: []\nversion: 0\n")).toEqual([
      { path: "", code: "duplicate-key", message: 'duplicate key "version"', line: 3, column: 1 },
    ]);
    expect(issuesOf("a:\n  b: 1\n  b: 2\nc: 1\nc: 2\n")).toMatchObject([
      { code: "duplicate-key", line: 3 },
      { code: "duplicate-key", line: 5 },
    ]);
  });

  test("a map with 80 000 keys is checked in linear time", () => {
    const keys = Array.from({ length: 80_000 }, (_, index) => `k${String(index)}: 0`);
    const started = performance.now();
    expect(issuesOf([...keys, "k7: 1"].join("\n"))).toMatchObject([
      { code: "duplicate-key", line: 80_001, column: 1 },
    ]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("more than maxAliases aliases fail before any alias is resolved", () => {
    const anchors = Array.from(
      { length: 40_000 },
      (_, index) => `a${String(index)}: &x${String(index)} 0`,
    );
    const aliases = Array.from(
      { length: 40_000 },
      (_, index) => `b${String(index)}: *x${String(index)}`,
    );
    const started = performance.now();
    expect(issuesOf([...anchors, ...aliases].join("\n"))).toEqual([
      expect.objectContaining({ code: "too-large", line: 40_000 + DesignLimits.maxAliases + 1 }),
    ]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("aliases within the limit resolve", () => {
    const source = `${minimalYaml}styles:\n  a: &card { opacity: 1 }\n  b: *card\n`;
    const result = parseDesign(source);
    expect(result.ok && result.value.styles).toEqual({ a: { opacity: 1 }, b: { opacity: 1 } });
  });

  test("an alias to no earlier anchor is a parse issue with line and column", () => {
    expect(issuesOf(`${minimalYaml}title: *nope\n`)).toEqual([
      { path: "", code: "parse", message: 'unknown YAML alias "nope"', line: 4, column: 8 },
    ]);
    expect(issuesOf(`${minimalYaml}title: *late\ndescription: &late x\n`)).toMatchObject([
      { code: "parse", line: 4 },
    ]);
  });

  test("a YAML source at the size limit parses within seconds", () => {
    const layer = "  - { type: rect, x: 1, y: 2, width: 10, height: 10, fill: '#fff' }\n";
    const count = Math.floor((DesignLimits.maxSourceLength - minimalYaml.length) / layer.length);
    const source = minimalYaml.replace("layers: []\n", "layers:\n") + layer.repeat(count);
    expect(source.length).toBeLessThanOrEqual(DesignLimits.maxSourceLength);
    const started = performance.now();
    expect(issuesOf(source)).toMatchObject([{ code: "too-many-layers" }]);
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 20_000);

  test("unknown and language-specific tags are rejected", () => {
    for (const tag of [
      "!!js/function 'f'",
      "!custom value",
      "!!binary aGk=",
      "!!timestamp 2020-01-01",
    ])
      expect(issuesOf(`${minimalYaml}title: ${tag}\n`), tag).toMatchObject([
        { code: "parse", message: "unknown YAML tag", line: 4 },
      ]);
  });

  test("core tags still work", () => {
    expect(parseDesignSource(["a: !!str 5", "b: !!int '7'"].join("\n"))).toEqual({
      ok: true,
      value: { a: "5", b: 7 },
    });
  });

  test("a multi-document stream is rejected", () => {
    expect(issuesOf(`${minimalYaml}---\n${minimalYaml}`)).toMatchObject([
      { code: "parse", line: 4 },
    ]);
  });

  test("merge keys are plain keys", () => {
    const source = `${minimalYaml}styles:\n  base: &base { opacity: 1 }\n  card: { <<: *base }\n`;
    expect(issuesOf(source)).toMatchObject([{ path: "/styles/card/<<", code: "unknown-property" }]);
  });

  test("an alias bomb fails fast", () => {
    const bomb = [
      'a: &a ["x","x","x","x","x","x","x","x","x"]',
      "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]",
      "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]",
      "d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]",
      "e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]",
      "f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e]",
    ].join("\n");
    const started = performance.now();
    expect(issuesOf(bomb)).toMatchObject([{ code: "too-large" }]);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("a self-referencing alias ends as too-deep", () => {
    expect(
      issuesOf("version: 0\ncanvas: &c { width: 1, height: 1, more: [*c, *c] }\nlayers: []\n"),
    ).toMatchObject([{ code: "too-deep" }]);
  });

  test("deep nesting is reported once, without a RangeError", () => {
    expect(issuesOf("[".repeat(10_000))).toEqual([
      expect.objectContaining({ code: "too-deep", path: "" }),
    ]);
  });

  test("non-string keys are rejected", () => {
    expect(issuesOf("? [a, b]\n: c\n")).toMatchObject([{ code: "parse" }]);
  });

  test("a byte order mark is accepted", () => {
    expect(parseDesign(`\ufeff${minimalYaml}`).ok).toBe(true);
  });
});

describe("format choice and limits", () => {
  test("auto-detects JSON by a leading brace and YAML otherwise", () => {
    expect(parseDesign(`  \n${minimalJson}`).ok).toBe(true);
    expect(parseDesign(minimalYaml).ok).toBe(true);
    const flowYaml = "{version: 0, canvas: {width: 1, height: 1}, layers: []}";
    expect(parseDesign(flowYaml).ok).toBe(false);
    expect(parseDesign(flowYaml, { format: "yaml" }).ok).toBe(true);
  });

  test("an oversized source fails before parsing", () => {
    const source = `{${" ".repeat(DesignLimits.maxSourceLength)}`;
    expect(issuesOf(source)).toEqual([expect.objectContaining({ path: "", code: "too-large" })]);
  });

  test("an empty source or a scalar root is not a design", () => {
    expect(issuesOf("")).toMatchObject([{ path: "", code: "type" }]);
    expect(issuesOf("just text")).toMatchObject([{ path: "", code: "type" }]);
  });

  test("parse messages never echo a long input", () => {
    const long = "Q".repeat(5000);
    for (const source of [`{"${long}": 1, "${long}": 2}`, `{"a": ${long}}`, `a: !${long} x\n`])
      for (const issue of issuesOf(source)) expect(issue.message).not.toMatch(/Q{65}/u);
  });
});
