import { describe, expect, test } from "vitest";
import type { ExprNode } from "../src/ExprNode.js";
import { parseExpression } from "../src/parseExpression.js";
import { tokenize } from "../src/tokenize.js";
import { errorOf, valueOf } from "./evaluateText.js";

function parse(expression: string): ExprNode {
  const source = `{{${expression}}}`;
  const tokens = tokenize(source, 2);
  if (!tokens.ok) expect.fail(tokens.error.message);
  const node = parseExpression(tokens.value.tokens, {
    source,
    segment: { start: 0, end: source.length },
  });
  if (!node.ok) expect.fail(node.error.message);
  return node.value;
}

describe("parseExpression", () => {
  test.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["2 - 3 - 4", -5],
    ["12 / 2 / 3", 2],
    ["7 % 4 * 2", 6],
    ["-2 * 3", -6],
    ["- -2", 2],
    ["1 < 2 == true", true],
    ["1 + 1 == 2 && 2 > 1", true],
    ["true || false && false", true],
    ["(true || false) && false", false],
    ["!false && !0", true],
    ["false ? 1 : true ? 2 : 3", 2],
    ["1 > 0 ? 'yes' : 'no'", "yes"],
    ['("a" | upper) + "b"', "Ab"],
    ['"a" + "b" | upper', "AB"],
    ['null | default("y" | upper)', "Y"],
    ["[1, 2, 3][1]", 2],
    ["[]", []],
    ["[[1], [2, [3]]][1][1][0]", 3],
  ])("%s is %j", (expression, expected) => {
    expect(valueOf(`{{ ${expression} }}`)).toEqual(expected);
  });

  test("pipes bind looser than the conditional", () => {
    const node = parse("a ? b : c | upper");
    expect(node.kind).toBe("pipe");
    expect(node.kind === "pipe" && node.input.kind).toBe("conditional");
  });

  test("operator chains, paths and pipes are flat lists", () => {
    const chain = parse("a + b - c");
    expect(chain.kind === "chain" && chain.links.map((link) => link.operator)).toEqual(["+", "-"]);
    const path = parse("a.b[0].c");
    expect(path.kind === "path" && path.steps.map((step) => step.kind)).toEqual([
      "property",
      "index",
      "property",
    ]);
    const pipe = parse("a | upper | trim");
    expect(pipe.kind === "pipe" && pipe.filters.map((filter) => filter.name)).toEqual([
      "upper",
      "trim",
    ]);
  });

  test("keeps 0-based spans of the whole text", () => {
    expect(parse(" a + 10 ")).toMatchObject({
      start: 3,
      end: 9,
      links: [{ operator: "+", start: 5, end: 9, operand: { start: 7, end: 9 } }],
    });
  });

  test.each([
    ["{{ upper(a) }}", "syntax", 8, "only filters can be called"],
    ["{{ a(1) }}", "syntax", 4, "only filters can be called"],
    ["{{ 1 + }}", "syntax", 7, "unexpected end of placeholder"],
    ["{{ a b }}", "syntax", 5, "unexpected name b"],
    ["{{ }}", "syntax", 3, "empty placeholder"],
    ["{{ (1 }}", "syntax", 6, 'expected ")"'],
    ["{{ [1, 2 }}", "syntax", 9, 'expected "]"'],
    ["{{ a ? 1 }}", "syntax", 9, 'expected ":"'],
    ["{{ a. }}", "syntax", 6, "expected a property name"],
    ["{{ a.0 }}", "syntax", 5, "expected a property name"],
    ["{{ a | }}", "syntax", 7, "expected a filter name"],
    ["{{ a | 1 }}", "syntax", 7, "expected a filter name"],
    ["{{ a | nope }}", "unknown-filter", 7, "unknown filter nope"],
    ["{{ a | constructor }}", "unknown-filter", 7, "unknown filter constructor"],
    ["{{ a | __proto__ }}", "unknown-filter", 7, "unknown filter __proto__"],
    ["{{ a | toString }}", "unknown-filter", 7, "unknown filter toString"],
    ["{{ a | hasOwnProperty }}", "unknown-filter", 7, "unknown filter hasOwnProperty"],
    ["{{ a | round(1, 2) }}", "argument", 7, "round takes 0 to 1 argument(s)"],
    ["{{ a | clamp(1) }}", "argument", 7, "clamp takes 2 argument(s)"],
    ["{{ a | default }}", "argument", 7, "default takes 1 argument(s)"],
    ["{{ a | upper(1, 2, 3, 4, 5) }}", "argument", 25, "at most 4 arguments"],
  ])("%s fails with %s at %i", (text, code, start, message) => {
    const error = errorOf(text);
    expect(error).toMatchObject({ code, start });
    expect(error.message).toContain(message);
    expect(error.message).toMatch(/ at column \d+$/);
  });

  test("a filter without arguments may be called with empty parentheses", () => {
    expect(valueOf('{{ "a" | upper() }}')).toBe("A");
  });
});
