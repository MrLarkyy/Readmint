import { describe, expect, test } from "vitest";
import { parseDesign, type DesignIssueCode } from "../src/index.js";
import { loadFixtures } from "./loadFixtures.js";

const valid = loadFixtures("valid");
const invalid = loadFixtures("invalid");

describe("valid fixtures", () => {
  test.each(valid.map((fixture) => [fixture.file, fixture] as const))("%s", (_file, fixture) => {
    const result = parseDesign(fixture.source);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  test("the YAML twin parses to the same design as the JSON document", () => {
    const json = parseDesign(sourceOf("every-layer-kind.design.json"));
    const yaml = parseDesign(sourceOf("every-layer-kind.design.yaml"));
    expect(json.ok && yaml.ok).toBe(true);
    expect(yaml).toEqual(json);
  });
});

describe("invalid fixtures", () => {
  test.each(invalid.map((fixture) => [fixture.file, fixture] as const))("%s", (_file, fixture) => {
    const result = parseDesign(fixture.source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map(({ path, code }) => ({ path, code }))).toEqual(fixture.expected);
    for (const issue of result.issues) expect(issue.message.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(false);
  });

  test("cover every structural and reference code", () => {
    const codes = new Set(invalid.flatMap((fixture) => fixture.expected?.map((e) => e.code) ?? []));
    const covered: DesignIssueCode[] = [
      "unsupported-version",
      "missing-property",
      "unknown-property",
      "type",
      "enum",
      "pattern",
      "range",
      "length",
      "count",
      "duplicate-id",
      "unknown-reference",
      "component-cycle",
      "missing-font",
      "reserved-name",
      "duplicate-name",
    ];
    expect([...codes].sort()).toEqual([...covered].sort());
  });
});

function sourceOf(file: string): string {
  const fixture = valid.find((candidate) => candidate.file === file);
  if (fixture === undefined) throw new Error(`no fixture ${file}`);
  return fixture.source;
}
