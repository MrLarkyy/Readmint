import { describe, expect, test } from "vitest";
import { DesignLimits, quoteInput } from "../src/index.js";

describe("quoteInput defaults", () => {
  test.each([
    ["\u0085", "\\u0085"],
    ["\u061c", "\\u061c"],
    ["\u2028", "\\u2028"],
    ["\u202e", "\\u202e"],
    ["\u0007", "\\u0007"],
  ])("escapes %j", (char, escaped) => {
    expect(quoteInput(`a${char}b`)).toBe(`"a${escaped}b"`);
  });

  test("keeps zero-width, private-use and astral characters raw", () => {
    expect(quoteInput("a\u200b\ue000\u{1f600}")).toBe('"a\u200b\ue000\u{1f600}"');
  });

  test("escapes quotes and backslashes as JSON does", () => {
    expect(quoteInput('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  test(`clips at ${String(DesignLimits.maxEcho)} code points`, () => {
    const exact = "\u{1f600}".repeat(DesignLimits.maxEcho);
    expect(quoteInput(exact)).toBe(`"${exact}"`);
    expect(quoteInput(`${exact}x`)).toBe(`"${"\u{1f600}".repeat(DesignLimits.maxEcho - 1)}\u2026"`);
  });
});

describe("quoteInput options", () => {
  test("maxEcho moves the clip", () => {
    const value = "a".repeat(300);
    expect(quoteInput("a".repeat(200), { maxEcho: 200 })).toBe(`"${"a".repeat(200)}"`);
    expect(quoteInput(value, { maxEcho: 200 })).toBe(`"${"a".repeat(199)}\u2026"`);
  });

  test("escape decides per code point, an astral one escaped per UTF-16 unit", () => {
    const escape = (codePoint: string) => codePoint === "\u200b" || codePoint === "\u{f0000}";
    expect(quoteInput("a\u200b\u{f0000}\u202e", { escape })).toBe('"a\\u200b\\udb80\\udc00\u202e"');
  });
});
