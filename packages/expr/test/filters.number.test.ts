import { describe, expect, test } from "vitest";
import { errorOf, valueOf } from "./evaluateText.js";

const nbsp = "\u00a0";
const nnbsp = "\u202f";

function format(expression: string, n: number, locale = "en"): unknown {
  return valueOf(`{{ n | ${expression} }}`, { n }, { locale });
}

describe("number", () => {
  test.each([
    ["en", "1,234,567.89"],
    ["de", "1.234.567,89"],
    ["fr", `1${nnbsp}234${nnbsp}567,89`],
    ["es", "1.234.567,89"],
    ["cs", `1${nbsp}234${nbsp}567,89`],
  ])("groups and separates decimals in %s", (locale, expected) => {
    expect(format("number(2)", 1234567.891, locale)).toBe(expected);
  });

  test("minimum grouping digits: Spanish groups from five integer digits", () => {
    expect(format("number", 1234, "es")).toBe("1234");
    expect(format("number", 12345, "es")).toBe("12.345");
    expect(format("number", 1234, "de")).toBe("1.234");
    expect(format("number", 999, "en")).toBe("999");
  });

  test.each([
    [2.5, 0, "3"],
    [-2.5, 0, "-3"],
    [0.5, 0, "1"],
    [0.125, 2, "0.13"],
    [1.005, 2, "1.00"],
    [1.45, 1, "1.4"],
    [8.345, 2, "8.35"],
    [1234.5, 0, "1,235"],
    [0, 3, "0.000"],
    [1, 20, "1.00000000000000000000"],
  ])("rounds %d to %i decimals with toFixed: %s", (n, decimals, expected) => {
    expect(format(`number(${String(decimals)})`, n)).toBe(expected);
  });

  test("-0 and values rounding to zero carry no sign", () => {
    expect(format("number", -0)).toBe("0");
    expect(format("number", -0.4)).toBe("0");
    expect(format("number(1)", -0.04)).toBe("0.0");
    expect(format("number(1)", -0.4)).toBe("-0.4");
    expect(format("number", -1234, "de")).toBe("-1.234");
  });

  test("from 1e21 on, numbers are written as String(n)", () => {
    expect(format("number", 1e21)).toBe("1e+21");
    expect(format("number", -1e21, "de")).toBe("-1e+21");
    expect(format("number", 123456789012345680000)).toBe("123,456,789,012,345,683,968");
  });

  test.each([
    ["number(21)", "argument"],
    ["number(-1)", "argument"],
    ["number(1.5)", "argument"],
    ["number('2')", "argument"],
    ["number(0, 5)", "argument"],
    ["number(0, 'xx')", "unknown-locale"],
    ["number(0, '')", "unknown-locale"],
    ["number(0, 'english-but-a-very-long-tag-of-more-than-35')", "unknown-locale"],
  ])("%s fails with %s", (expression, code) => {
    expect(errorOf(`{{ 1 | ${expression} }}`).code).toBe(code);
  });

  test("a string input is a type error, null passes through", () => {
    expect(errorOf("{{ '1' | number }}").code).toBe("type");
    expect(valueOf("{{ null | number }}")).toBeNull();
  });
});

describe("compact", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [12.34, "12.3"],
    [999.94, "999.9"],
    [999.95, "1K"],
    [1000, "1K"],
    [1234, "1.2K"],
    [1250, "1.3K"],
    [999_499, "999.5K"],
    [999_950, "1M"],
    [1_000_000, "1M"],
    [1_500_000_000, "1.5B"],
    [1e12, "1T"],
    [1e15, "1,000T"],
    [-1234, "-1.2K"],
    [-0.04, "0"],
  ])("compacts %d to %s", (n, expected) => {
    expect(format("compact", n)).toBe(expected);
  });

  test("decimals change the precision and trailing zeros are dropped", () => {
    expect(format("compact(0)", 1234)).toBe("1K");
    expect(format("compact(2)", 1234)).toBe("1.23K");
    expect(format("compact(2)", 1500)).toBe("1.5K");
  });

  test.each([
    ["en", ["1.2K", "1.2M", "1.2B", "1.2T"]],
    ["de", [`1,2${nbsp}Tsd.`, `1,2${nbsp}Mio.`, `1,2${nbsp}Mrd.`, `1,2${nbsp}Bio.`]],
    ["fr", [`1,2${nbsp}k`, `1,2${nbsp}M`, `1,2${nbsp}Md`, `1,2${nbsp}Bn`]],
    ["es", [`1,2${nbsp}mil`, `1,2${nbsp}M`, `1,2${nbsp}mil${nbsp}M`, `1,2${nbsp}B`]],
    ["cs", [`1,2${nbsp}tis.`, `1,2${nbsp}mil.`, `1,2${nbsp}mld.`, `1,2${nbsp}bil.`]],
  ])("uses the %s suffixes", (locale, expected) => {
    const values = [1234, 1_234_567, 1_234_567_890, 1_234_567_890_123];
    expect(values.map((n) => format("compact", n, locale))).toEqual(expected);
  });

  test("from 1e21 on, compact writes String(n)", () => {
    expect(format("compact", 2e21)).toBe("2e+21");
  });
});

describe("percent", () => {
  test.each([
    ["en", "25%"],
    ["de", `25${nbsp}%`],
    ["fr", `25${nbsp}%`],
    ["es", `25${nbsp}%`],
    ["cs", `25${nbsp}%`],
  ])("writes a percentage in %s", (locale, expected) => {
    expect(format("percent", 0.25, locale)).toBe(expected);
  });

  test("scales by 100 before rounding", () => {
    expect(format("percent(1)", 0.12345)).toBe("12.3%");
    expect(format("percent", -0.5)).toBe("-50%");
    expect(format("percent(1)", 0.5, "de")).toBe(`50,0${nbsp}%`);
    expect(format("percent", 1e300)).toBe("1e+302%");
  });

  test("a product past the number range is not-finite", () => {
    expect(errorOf("{{ 1e307 | percent }}").code).toBe("not-finite");
  });
});

describe("round, floor, ceil, abs, min, max, clamp", () => {
  test.each([
    ["round", 2.5, 3],
    ["round", -2.5, -3],
    ["round", 2.4, 2],
    ["round(2)", 1.005, 1],
    ["round(2)", 1.2345, 1.23],
    ["round", 1e21, 1e21],
    ["floor", -1.5, -2],
    ["floor", 1.9, 1],
    ["ceil", 1.2, 2],
    ["ceil", -1.2, -1],
    ["abs", -3, 3],
    ["min(3)", 5, 3],
    ["max(3)", 5, 5],
    ["clamp(0, 3)", 5, 3],
    ["clamp(0, 3)", -5, 0],
    ["clamp(0, 3)", 2, 2],
  ])("%s of %d is %d", (expression, n, expected) => {
    expect(format(expression, n)).toBe(expected);
  });

  test("round to zero from below writes 0 in text", () => {
    expect(valueOf("{{ n | round }}!", { n: -0.4 })).toBe("0!");
  });

  test.each([
    ["{{ 1 | clamp(3, 0) }}", "argument"],
    ["{{ 1 | clamp('a', 2) }}", "argument"],
    ["{{ 1 | min('a') }}", "argument"],
    ["{{ 1 | round(21) }}", "argument"],
    ["{{ 'a' | abs }}", "type"],
    ["{{ [1] | floor }}", "type"],
  ])("%s fails with %s", (text, code) => {
    expect(errorOf(text).code).toBe(code);
  });
});

describe("sqrt and array min, max", () => {
  test.each([
    [4, 2],
    [2, 1.4142135623730951],
    [0, 0],
  ])("sqrt of %d is %d", (n, expected) => {
    expect(format("sqrt", n)).toBe(expected);
  });

  test("sqrt of -0 is -0, written 0", () => {
    expect(Object.is(format("sqrt", -0), -0)).toBe(true);
    expect(valueOf("{{ n | sqrt }}!", { n: -0 })).toBe("0!");
  });

  test("an array gives its largest or smallest item", () => {
    expect(valueOf("{{ [3, 1, 2] | max }}")).toBe(3);
    expect(valueOf("{{ [3, 1, 2] | min }}")).toBe(1);
    expect(valueOf("{{ list | max }}", { list: [-5, 7.5, 7] })).toBe(7.5);
    expect(valueOf("{{ [4] | min }}")).toBe(4);
  });

  test("an empty array gives null, a null input passes through", () => {
    expect(valueOf("{{ list | max }}", { list: [] })).toBeNull();
    expect(valueOf("{{ list | min | default(0) }}", { list: [] })).toBe(0);
    expect(valueOf("{{ v | max }}", { v: null })).toBeNull();
    expect(valueOf("{{ v | min }}", { v: null })).toBeNull();
  });

  test("-0 is below 0 whatever the order", () => {
    expect(Object.is(valueOf("{{ list | min }}", { list: [0, -0] }), -0)).toBe(true);
    expect(Object.is(valueOf("{{ list | min }}", { list: [-0, 0] }), -0)).toBe(true);
    expect(Object.is(valueOf("{{ list | max }}", { list: [-0, 0] }), 0)).toBe(true);
    expect(Object.is(valueOf("{{ list | max }}", { list: [0, -0] }), 0)).toBe(true);
  });

  test("the number form is unchanged", () => {
    expect(format("max(3)", 5)).toBe(5);
    expect(format("min(3)", 5)).toBe(3);
  });

  test.each([
    ["{{ -1 | sqrt }}", "not-finite"],
    ["{{ '4' | sqrt }}", "type"],
    ["{{ [4] | sqrt }}", "type"],
    ["{{ [1, 'a'] | max }}", "type"],
    ["{{ [1, null] | min }}", "type"],
    ["{{ [[1]] | max }}", "type"],
    ["{{ 'a' | max }}", "type"],
    ["{{ [1] | max(2) }}", "argument"],
    ["{{ [1] | max(true) }}", "argument"],
    ["{{ [] | min(2) }}", "argument"],
    ["{{ 5 | max('c') }}", "argument"],
    ["{{ 5 | max }}", "argument"],
    ["{{ 5 | min }}", "argument"],
    ["{{ 5 | min() }}", "argument"],
  ])("%s fails with %s", (text, code) => {
    expect(errorOf(text).code).toBe(code);
  });

  test("an object input is a type error", () => {
    expect(errorOf("{{ o | max }}", { o: { a: 1 } }).code).toBe("type");
  });

  test("messages name types, never values", () => {
    expect(errorOf("{{ [1, 'secret'] | max }}").message).toContain(
      "max: items must be numbers, got string",
    );
    expect(errorOf("{{ o | min }}", { o: { a: 1 } }).message).toContain(
      "min needs a number or an array, got object",
    );
    expect(errorOf("{{ 5 | max }}").message).toContain("max: argument 1 is required");
    expect(errorOf("{{ [1] | max(2) }}").message).toContain("max: argument 1 must be a string");
  });

  test("a non-finite item in the host data is invalid-data", () => {
    expect(errorOf("{{ list | max }}", { list: [1, Number.NaN] }).code).toBe("invalid-data");
    expect(errorOf("{{ list | min }}", { list: [Infinity] }).code).toBe("invalid-data");
  });
});

describe("array min, max with a key", () => {
  const list = [{ c: 3 }, { c: 1 }, { c: 2 }];

  test("reads the property of every item", () => {
    expect(valueOf("{{ list | max('c') }}", { list })).toBe(3);
    expect(valueOf("{{ list | min('c') }}", { list })).toBe(1);
    expect(valueOf("{{ list | max('') }}", { list: [{ "": 4 }, { "": 9 }] })).toBe(9);
  });

  test("-0 is below 0, an empty list and a null input give null", () => {
    expect(Object.is(valueOf("{{ list | min('c') }}", { list: [{ c: 0 }, { c: -0 }] }), -0)).toBe(
      true,
    );
    expect(valueOf("{{ list | max('c') }}", { list: [] })).toBeNull();
    expect(valueOf("{{ v | max('c') }}", { v: null })).toBeNull();
  });

  test("a null key is no key", () => {
    expect(valueOf("{{ list | max(null) }}", { list: [1, 5] })).toBe(5);
    expect(errorOf("{{ list | max(null) }}", { list }).code).toBe("type");
  });

  test.each([
    [[{}]],
    [[{ c: "1" }]],
    [[{ c: null }]],
    [[1]],
    [[[1]]],
    [[null]],
    [[{ c: 1 }, { d: 2 }]],
  ])("%j with max('c') is a type error", (items) => {
    expect(errorOf("{{ list | max('c') }}", { list: items }).code).toBe("type");
  });

  test("a non-finite property or a getter is invalid-data", () => {
    expect(errorOf("{{ list | max('c') }}", { list: [{ c: Number.NaN }] }).code).toBe(
      "invalid-data",
    );
  });

  test("messages never carry the key or a value", () => {
    const message = errorOf("{{ list | max('secret') }}", { list: [{ secret: "x" }] }).message;
    expect(message).toContain("max: item properties must be numbers, got string");
    expect(message).not.toContain("secret");
    expect(errorOf("{{ [1] | min('secret') }}").message).toContain(
      "min: items must be objects, got number",
    );
  });
});
