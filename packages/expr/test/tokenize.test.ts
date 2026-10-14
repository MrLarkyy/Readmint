import { describe, expect, test } from "vitest";
import { tokenize } from "../src/tokenize.js";
import type { Token } from "../src/Token.js";

function tokensOf(source: string): readonly Token[] {
  const result = tokenize(source, 2);
  if (!result.ok) expect.fail(`${source}: ${result.error.message}`);
  return result.value.tokens;
}

function kindsAndValues(source: string): [string, unknown][] {
  return tokensOf(source).map((token) => [token.kind, token.value]);
}

describe("tokenize", () => {
  test("scans names, numbers, strings and operators with spans", () => {
    const source = "{{ a.b + 1.5e3 | f(\"x\", 'y') }}";
    expect(tokensOf(source)).toEqual([
      { kind: "name", value: "a", start: 3, end: 4 },
      { kind: "operator", value: ".", start: 4, end: 5 },
      { kind: "name", value: "b", start: 5, end: 6 },
      { kind: "operator", value: "+", start: 7, end: 8 },
      { kind: "number", value: 1500, start: 9, end: 14 },
      { kind: "operator", value: "|", start: 15, end: 16 },
      { kind: "name", value: "f", start: 17, end: 18 },
      { kind: "operator", value: "(", start: 18, end: 19 },
      { kind: "string", value: "x", start: 19, end: 22 },
      { kind: "operator", value: ",", start: 22, end: 23 },
      { kind: "string", value: "y", start: 24, end: 27 },
      { kind: "operator", value: ")", start: 27, end: 28 },
      { kind: "close", value: "}}", start: 29, end: 31 },
    ]);
  });

  test("returns the offset after the closing braces", () => {
    const result = tokenize("{{a}} tail", 2);
    expect(result.ok && result.value.end).toBe(5);
  });

  test("scans two-character operators before one-character ones", () => {
    expect(kindsAndValues("{{ == != <= >= && || < > ! }}").map(([, value]) => value)).toEqual([
      "==",
      "!=",
      "<=",
      ">=",
      "&&",
      "||",
      "<",
      ">",
      "!",
      "}}",
    ]);
  });

  test("decodes every string escape", () => {
    const source = String.raw`{{ "\\ \' \" \n \t \u{41} \u{1F600}" }}`;
    expect(tokensOf(source)[0]).toMatchObject({
      kind: "string",
      value: "\\ ' \" \n \t A \u{1F600}",
    });
  });

  test("keeps }} inside a string literal", () => {
    expect(kindsAndValues('{{ "a }} b" }}')).toEqual([
      ["string", "a }} b"],
      ["close", "}}"],
    ]);
  });

  test.each([
    ["my-label", [["name", "my-label"]]],
    [
      "props.my-label",
      [
        ["name", "props"],
        ["operator", "."],
        ["name", "my-label"],
      ],
    ],
    ["a_b-c_d", [["name", "a_b-c_d"]]],
    [
      "x-1",
      [
        ["name", "x"],
        ["operator", "-"],
        ["number", 1],
      ],
    ],
    [
      "x - y",
      [
        ["name", "x"],
        ["operator", "-"],
        ["name", "y"],
      ],
    ],
    [
      "x--y",
      [
        ["name", "x"],
        ["operator", "-"],
        ["operator", "-"],
        ["name", "y"],
      ],
    ],
    [
      "x-",
      [
        ["name", "x"],
        ["operator", "-"],
      ],
    ],
  ])("a hyphen joins a name only before a letter or _: %s", (expression, expected) => {
    expect(kindsAndValues(`{{${expression}}}`).slice(0, -1)).toEqual(expected);
  });

  test.each([
    ['{{ "abc }}', "syntax", 3, "unterminated string"],
    ["{{ 'abc", "syntax", 3, "unterminated string"],
    [String.raw`{{ "a\q" }}`, "syntax", 5, "unknown escape"],
    [String.raw`{{ "\u{D800}" }}`, "syntax", 4, "invalid \\u{...} escape"],
    [String.raw`{{ "\u{110000}" }}`, "syntax", 4, "invalid \\u{...} escape"],
    [String.raw`{{ "\u{}" }}`, "syntax", 4, "invalid \\u{...} escape"],
    [String.raw`{{ "\u41" }}`, "syntax", 4, "unknown escape"],
    ["{{ a = b }}", "syntax", 5, "compare with =="],
    ["{{ a & b }}", "syntax", 5, "unexpected character"],
    ["{{ { }}", "syntax", 3, "unexpected character"],
    ["{{ a } }}", "syntax", 5, "unexpected character"],
    ["{{ 2px }}", "syntax", 4, "after a number"],
    ["{{ 1e999 }}", "not-finite", 3, "out of range"],
    ["{{ a", "syntax", 0, "unclosed {{"],
  ])("%s fails with %s at %i", (source, code, start, message) => {
    const result = tokenize(source, 2);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code, start });
    expect(result.error.message).toContain(message);
  });

  test("a number may end in a dot that starts a property access", () => {
    expect(kindsAndValues("{{ 1.x }}").slice(0, -1)).toEqual([
      ["number", 1],
      ["operator", "."],
      ["name", "x"],
    ]);
  });
});
