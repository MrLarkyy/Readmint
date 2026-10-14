import { describe, expect, test } from "vitest";
import { compileTemplate, createScope, ExpressionLimits } from "../src/index.js";
import { errorOf, valueOf } from "./evaluateText.js";

describe("compileTemplate", () => {
  test("a text that is exactly one placeholder is an expression and keeps the value's type", () => {
    const template = compileTemplate("{{ count }}");
    expect(template.ok && template.value.kind).toBe("expression");
    expect(valueOf("{{ count }}", { count: 3 })).toBe(3);
    expect(valueOf("{{ flag }}", { flag: false })).toBe(false);
    expect(valueOf("{{ missing.x }}", { missing: null })).toBeNull();
    expect(valueOf("{{ list }}", { list: [1, 2] })).toEqual([1, 2]);
  });

  test("any other text is a text template and gives a string", () => {
    const template = compileTemplate("{{a}} x {{b}}");
    expect(template.ok && template.value.kind).toBe("text");
    expect(valueOf("{{a}} x {{b}}", { a: 1, b: 2 })).toBe("1 x 2");
    expect(valueOf(" {{ a }}", { a: 1 })).toBe(" 1");
    expect(valueOf("{{ a }}{{ b }}", { a: 1, b: 2 })).toBe("12");
    expect(valueOf("plain")).toBe("plain");
    expect(valueOf("")).toBe("");
  });

  test("writes numbers, booleans and null into text", () => {
    const data = { n: 1.5, t: true, f: false, z: null, m: -0 };
    expect(valueOf("{{ n }}|{{ t }}|{{ f }}|{{ z }}|{{ m }}", data)).toBe("1.5|true|false||0");
  });

  test("an array or an object cannot be written into text", () => {
    expect(errorOf("x {{ list }}", { list: [] })).toMatchObject({
      code: "type",
      start: 2,
      end: 12,
    });
    expect(errorOf("x {{ o }}", { o: {} }).code).toBe("type");
  });

  test("}} inside a string literal does not close the placeholder", () => {
    expect(valueOf('{{ "}}" }}')).toBe("}}");
    expect(valueOf("a {{ '}}' + \"{{\" }} b")).toBe("a }}{{ b");
  });

  test("a literal {{ is written as a string placeholder", () => {
    expect(valueOf('{{ "{{" }} name }}')).toBe("{{ name }}");
  });

  test("a lone }} outside a placeholder is literal text", () => {
    expect(valueOf("a }} b")).toBe("a }} b");
    expect(valueOf("{{ 1 }}}")).toBe("1}");
  });

  test("an unclosed {{ is a syntax error at the braces", () => {
    expect(errorOf("ab {{ c")).toMatchObject({ code: "syntax", start: 3, end: 5 });
  });

  test("an empty placeholder is a syntax error", () => {
    expect(errorOf("{{ }}").code).toBe("syntax");
    expect(errorOf("{{}}").code).toBe("syntax");
  });

  test("spans are offsets in the whole text", () => {
    expect(errorOf("first {{ a }} second {{ nope }}", { a: 1 })).toMatchObject({
      code: "unknown-name",
      start: 24,
      end: 28,
    });
  });

  test(`a text over ${String(ExpressionLimits.maxSourceLength)} characters is too long`, () => {
    const atLimit = "x".repeat(ExpressionLimits.maxSourceLength);
    expect(compileTemplate(atLimit).ok).toBe(true);
    const result = compileTemplate(`${atLimit}x`);
    expect(!result.ok && result.error).toMatchObject({
      code: "too-long",
      start: 10_000,
      end: 10_001,
    });
  });

  test("a compiled template is reused across scopes", () => {
    const template = compileTemplate("{{ n * 2 }}");
    if (!template.ok) expect.fail(template.error.message);
    expect(template.value.evaluate(createScope({ n: 1 }))).toEqual({ ok: true, value: 2 });
    expect(template.value.evaluate(createScope({ n: 5 }))).toEqual({ ok: true, value: 10 });
    expect(Object.isFrozen(template.value)).toBe(true);
    expect(template.value.source).toBe("{{ n * 2 }}");
  });
});
