import { describe, expect, test } from "vitest";
import { errorOf, valueOf } from "./evaluateText.js";

const emoji = "\u{1F600}";
const family = "\u{1F468}‍\u{1F469}";

describe("string filters", () => {
  test.each([
    ["'Ada' | upper", "ADA"],
    ["'ÄÖÜ ß' | upper", "ÄÖÜ SS"],
    ["'Ada' | lower", "ada"],
    ["'ÉCOLE' | lower", "école"],
    ["'  a b  ' | trim", "a b"],
    ["'\\t\\n a \\n' | trim", "a"],
  ])("%s gives %j", (expression, expected) => {
    expect(valueOf(`{{ ${expression} }}`)).toBe(expected);
  });

  test("case mapping does not depend on a host locale (Turkish dotted i)", () => {
    expect(valueOf("{{ 'i' | upper }}")).toBe("I");
    expect(valueOf("{{ 'I' | lower }}")).toBe("i");
  });

  test("truncate counts code points and includes the suffix in the length", () => {
    expect(valueOf("{{ 'abcdef' | truncate(4) }}")).toBe("abc…");
    expect(valueOf("{{ 'abcdef' | truncate(6) }}")).toBe("abcdef");
    expect(valueOf("{{ 'abcdef' | truncate(5, '...') }}")).toBe("ab...");
    expect(valueOf("{{ 'abcdef' | truncate(3, '') }}")).toBe("abc");
    expect(valueOf("{{ s | truncate(3) }}", { s: emoji.repeat(5) })).toBe(`${emoji}${emoji}…`);
    expect(valueOf("{{ s | truncate(3) }}", { s: emoji.repeat(3) })).toBe(emoji.repeat(3));
    expect(valueOf("{{ 'abc' | truncate(0, '') }}")).toBe("");
  });

  test("truncate never splits a surrogate pair", () => {
    const result = valueOf("{{ s | truncate(2, '') }}", { s: `a${emoji}b` });
    expect(result).toBe(`a${emoji}`);
  });

  test.each([
    ["{{ 'abc' | truncate(1, '...') }}", "argument"],
    ["{{ 'abc' | truncate(-1) }}", "argument"],
    ["{{ 'abc' | truncate('2') }}", "argument"],
    ["{{ 'abc' | truncate(2, 1) }}", "argument"],
    ["{{ 5 | truncate(2) }}", "type"],
    ["{{ 5 | upper }}", "type"],
    ["{{ [] | trim }}", "type"],
  ])("%s fails with %s", (text, code) => {
    expect(errorOf(text).code).toBe(code);
  });

  test("padStart pads strings and numbers by code points", () => {
    expect(valueOf("{{ 7 | padStart(3, '0') }}")).toBe("007");
    expect(valueOf("{{ 'ab' | padStart(4) }}")).toBe("  ab");
    expect(valueOf("{{ 'abcd' | padStart(2) }}")).toBe("abcd");
    expect(valueOf("{{ s | padStart(3, '-') }}", { s: emoji })).toBe(`--${emoji}`);
    expect(valueOf("{{ 'a' | padStart(3, s) }}", { s: emoji })).toBe(`${emoji}${emoji}a`);
  });

  test.each([
    ["{{ 'a' | padStart(3, '') }}", "argument"],
    ["{{ 'a' | padStart(3, 'ab') }}", "argument"],
    ["{{ 'a' | padStart(-1) }}", "argument"],
    ["{{ 'a' | padStart(2.5) }}", "argument"],
    ["{{ true | padStart(2) }}", "type"],
  ])("%s fails with %s", (text, code) => {
    expect(errorOf(text).code).toBe(code);
  });

  test("a sequence of several code points pads as several characters", () => {
    expect(errorOf("{{ 'a' | padStart(3, s) }}", { s: family }).code).toBe("argument");
  });
});

describe("general filters", () => {
  test("default replaces null only", () => {
    expect(valueOf("{{ missing.x | default('n/a') }}", { missing: {} })).toBe("n/a");
    expect(valueOf("{{ 0 | default(5) }}")).toBe(0);
    expect(valueOf("{{ '' | default('x') }}")).toBe("");
    expect(valueOf("{{ false | default(true) }}")).toBe(false);
    expect(valueOf("{{ null | default(null) }}")).toBeNull();
  });

  test("length counts code points of a string and items of an array", () => {
    expect(valueOf("{{ 'abc' | length }}")).toBe(3);
    expect(valueOf("{{ s | length }}", { s: `a${emoji}` })).toBe(2);
    expect(valueOf("{{ s | length }}", { s: "\uD800x" })).toBe(2);
    expect(valueOf("{{ [1, 2, 3] | length }}")).toBe(3);
    expect(valueOf("{{ '' | length }}")).toBe(0);
    expect(errorOf("{{ 5 | length }}").code).toBe("type");
    expect(errorOf("{{ o | length }}", { o: {} }).code).toBe("type");
  });

  test("join writes items like text", () => {
    expect(valueOf("{{ ['a', 1, true, null] | join }}")).toBe("a, 1, true, ");
    expect(valueOf("{{ ['a', 'b'] | join(' / ') }}")).toBe("a / b");
    expect(valueOf("{{ [] | join }}")).toBe("");
    expect(errorOf("{{ [[1]] | join }}").code).toBe("type");
    expect(errorOf("{{ 'ab' | join }}").code).toBe("type");
    expect(errorOf("{{ ['a'] | join(1) }}").code).toBe("argument");
  });

  test("join stops at the string limit", () => {
    const list = new Array<string>(3).fill("x".repeat(40_000));
    expect(errorOf("{{ list | join('') }}", { list }).code).toBe("too-large");
  });

  test("first and last read items and code points", () => {
    expect(valueOf("{{ [1, 2, 3] | first }}")).toBe(1);
    expect(valueOf("{{ [1, 2, 3] | last }}")).toBe(3);
    expect(valueOf("{{ [] | first }}")).toBeNull();
    expect(valueOf("{{ [] | last }}")).toBeNull();
    expect(valueOf("{{ s | first }}", { s: `${emoji}b` })).toBe(emoji);
    expect(valueOf("{{ s | last }}", { s: `a${emoji}` })).toBe(emoji);
    expect(valueOf("{{ '' | first }}")).toBe("");
    expect(valueOf("{{ '' | last }}")).toBe("");
    expect(errorOf("{{ 5 | first }}").code).toBe("type");
    expect(errorOf("{{ 5 | last }}").code).toBe("type");
  });

  test("first and last give the item itself, not a copy", () => {
    expect(valueOf("{{ (repos | first).name }}", { repos: [{ name: "a" }] })).toBe("a");
  });
});
