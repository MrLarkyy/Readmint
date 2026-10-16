import { expect, test } from "vitest";
import type { Design } from "../src/index.js";
import {
  DesignLimits,
  parseDesign,
  parseDesignAsync,
  stringifyDesignYamlAsync,
} from "../src/index.js";
import { loadFixtures } from "./loadFixtures.js";
import { maximalDesign } from "./maximalDesign.js";

async function yamlOf(design: Design): Promise<string> {
  const result = await stringifyDesignYamlAsync(design);
  if (!result.ok) throw new Error(`stringify refused: ${JSON.stringify(result.issues)}`);
  return result.value;
}

async function reread(text: string): Promise<Design> {
  const result = await parseDesignAsync(text, { format: "yaml" });
  if (!result.ok) throw new Error(`re-import failed: ${JSON.stringify(result.issues)}\n${text}`);
  return result.value;
}

function designWith(name: string): Design {
  return {
    version: 0,
    canvas: { width: 20, height: 20 },
    layers: [{ type: "rect", x: 0, y: 0, width: 4, height: 4, name }],
  };
}

function nameOf(design: Design): unknown {
  return (design.layers[0] as { name?: unknown }).name;
}

test("every valid fixture and the maximal design re-import to a deep-equal design", async () => {
  const designs: Design[] = [maximalDesign];
  for (const fixture of loadFixtures("valid")) {
    const parsed = parseDesign(fixture.source, { format: fixture.format });
    if (!parsed.ok) throw new Error(`${fixture.file} does not parse`);
    designs.push(parsed.value);
  }
  expect(designs.length).toBeGreaterThan(3);
  for (const design of designs) {
    expect(await reread(await yamlOf(design))).toEqual(design);
  }
});

const tricky = [
  "yes",
  "no",
  "on",
  "off",
  "true",
  "null",
  "~",
  "0x10",
  "0o7",
  "1e3",
  "12",
  "-0",
  ".inf",
  ".nan",
  "",
  " lead",
  "trail ",
  "# x",
  "a: b",
  "- a",
  "- ",
  "'q'",
  '"d"',
  "a\nb",
  "a  \nb\t\n  c\n",
  "tab\tinside",
  "<<",
  "*alias",
  "&anchor x",
  "!tag x",
  "{a: 1}",
  "[1, 2]",
  "emoji \u{1F600} é 中",
  "line sep   and \u0085",
  "\u0000nul",
  "---",
  "...",
  "x".repeat(120),
  "word ".repeat(24).trim(),
];

test.each(tricky)("the string %j survives a YAML round trip", async (value) => {
  const design = designWith(value);
  expect(nameOf(await reread(await yamlOf(design)))).toBe(value);
});

test("a lone surrogate survives a YAML round trip", async () => {
  const value = "a\uD800b";
  const design = designWith(value);
  expect(nameOf(await reread(await yamlOf(design)))).toBe(value);
});

test("an object used twice is written twice, never as an anchor", async () => {
  const shared = { type: "rect", x: 1, y: 2, width: 3, height: 4 } as const;
  const design = {
    version: 0,
    canvas: { width: 9, height: 9 },
    layers: [shared, shared],
  } as Design;
  const text = await yamlOf(design);
  expect(text).not.toMatch(/[&*]/u);
  expect(await reread(text)).toEqual(design);
});

test("the same design gives the same text, and the text of an imported JSON export is the same", async () => {
  const first = await yamlOf(maximalDesign);
  expect(await yamlOf(maximalDesign)).toBe(first);
  const viaJson = parseDesign(JSON.stringify(maximalDesign), { format: "json" });
  if (!viaJson.ok) throw new Error("the JSON export does not import");
  expect(await yamlOf(viaJson.value)).toBe(first);
});

test("keys keep the design's own order", async () => {
  const text = await yamlOf(designWith("n"));
  expect(text.indexOf("version")).toBeLessThan(text.indexOf("canvas"));
  expect(text.indexOf("canvas")).toBeLessThan(text.indexOf("layers"));
});

test("a long string stays on one line", async () => {
  const text = await yamlOf(designWith("word ".repeat(80).trim()));
  expect(text.split("\n").filter((line) => line.includes("word")).length).toBe(1);
});

test("YAML over the YAML source limit is refused naming both lengths", async () => {
  const design = designWith("x".repeat(DesignLimits.maxYamlSourceLength));
  const result = await stringifyDesignYamlAsync(design);
  if (result.ok) throw new Error("expected a refusal");
  const [issue] = result.issues;
  expect(issue?.code).toBe("too-large");
  expect(issue?.message).toContain(String(DesignLimits.maxYamlSourceLength));
  expect(issue?.message).toMatch(/\d{7,} characters as YAML/u);
  expect(issue?.message).toContain("export JSON instead");
});

test("let entries keep their evaluation order through YAML and back", async () => {
  const order = ["zeta", "alpha", "_m", "b-c", "a1"];
  const design: Design = {
    version: 0,
    canvas: { width: 20, height: 20 },
    layers: [
      {
        type: "rect",
        width: 4,
        height: 4,
        let: Object.fromEntries(order.map((key) => [key, "{{ 1 }}" as const])),
      },
    ],
  };
  const back = await reread(await yamlOf(design));
  expect(Object.keys((back.layers[0] as { let?: object }).let ?? {})).toEqual(order);
});
