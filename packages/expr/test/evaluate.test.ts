import { describe, expect, test } from "vitest";
import { errorOf, valueOf } from "./evaluateText.js";

const data = {
  user: {
    name: "Ada",
    "my-label": "tag",
    stats: { stars: 42, repos: [{ name: "a" }, { name: "b" }] },
  },
  level: 2,
  palette: ["#eee", "#9be", "#40c", "#30a", "#216"],
  empty: [],
  nothing: null,
  key: "name",
};

describe("evaluate", () => {
  test.each([
    ["user.name", "Ada"],
    ["user['name']", "Ada"],
    ['user["my-label"]', "tag"],
    ["user.my-label", "tag"],
    ["user[key]", "Ada"],
    ["user.stats.stars", 42],
    ["user.stats.repos[1].name", "b"],
    ["user.stats.repos[-1]", null],
    ["user.stats.repos[1.5]", null],
    ["user.stats.repos[9].name", null],
    ['["#eee","#9be"][level - 1]', "#9be"],
    ["palette[level]", "#40c"],
  ])("reads the path %s", (expression, expected) => {
    expect(valueOf(`{{ ${expression} }}`, data)).toEqual(expected);
  });

  test.each([
    "user.missing",
    "user.missing.deeper.still",
    "nothing.x",
    "nothing[0]",
    "user[nothing]",
    "user.name.length",
    "level.x",
    "palette.length",
    "palette['0']",
  ])("a missing or impossible property reads as null: %s", (expression) => {
    expect(valueOf(`{{ ${expression} }}`, data)).toBeNull();
  });

  test("an unknown root name is an error with a hint for a hyphenated name", () => {
    expect(errorOf("{{ nope }}", data)).toMatchObject({ code: "unknown-name", start: 3, end: 7 });
    const hyphen = errorOf("{{ level-one }}", data);
    expect(hyphen.code).toBe("unknown-name");
    expect(hyphen.message).toContain("write a - b with spaces");
    expect(valueOf("{{ level - 1 }}", data)).toBe(1);
  });

  test.each([
    ["1 + 2", 3],
    ["'a' + 'b'", "ab"],
    ["10 - 4", 6],
    ["3 * 4", 12],
    ["7 / 2", 3.5],
    ["7 % 3", 1],
    ["-7 % 3", -1],
    ["0.1 + 0.2", 0.30000000000000004],
  ])("computes %s", (expression, expected) => {
    expect(valueOf(`{{ ${expression} }}`)).toBe(expected);
  });

  test.each([
    ["1 + 'a'", "+ needs two numbers or two strings, got number and string"],
    ["'a' + null", "+ needs two numbers or two strings, got string and null"],
    ["true * 2", "* needs two numbers, got boolean and number"],
    ["-'a'", "unary - needs a number, got string"],
    ["1 < 'a'", "< needs two numbers or two strings, got number and string"],
    ["[1] == [1]", "== compares strings, numbers, booleans and null, got array and array"],
    ["user[true]", "an index must be a string or a number, got boolean"],
  ])("%s is a type error", (expression, message) => {
    const error = errorOf(`{{ ${expression} }}`, data);
    expect(error.code).toBe("type");
    expect(error.message).toContain(message);
  });

  test("reports an operator's error at the operator", () => {
    expect(errorOf("{{ 1 + 2 + 'a' }}")).toMatchObject({ code: "type", start: 9, end: 14 });
  });

  test.each(["1 / 0", "0 / 0", "5 % 0", "1e308 * 10", "-1e308 - 1e308"])(
    "%s is not finite",
    (expression) => {
      expect(errorOf(`{{ ${expression} }}`).code).toBe("not-finite");
    },
  );

  test.each([
    ["1 == 1", true],
    ["1 == '1'", false],
    ["null == null", true],
    ["nothing == null", true],
    ["user == null", false],
    ["true != false", true],
    ["'b' > 'a'", true],
    ["'B' < 'a'", true],
    ["'10' < '9'", true],
    ["2 >= 2", true],
    ["2 <= 1", false],
  ])("compares %s", (expression, expected) => {
    expect(valueOf(`{{ ${expression} }}`, data)).toBe(expected);
  });

  test.each([
    ["0 || 'x'", "x"],
    ["'' || 'x'", "x"],
    ["empty || 'x'", "x"],
    ["nothing || 'x'", "x"],
    ["'a' || 'x'", "a"],
    ["'a' && 'b'", "b"],
    ["0 && 'b'", 0],
    ["!empty", true],
    ["!palette", false],
    ["user ? 1 : 2", 1],
    ["empty ? 1 : 2", 2],
  ])("logic %s", (expression, expected) => {
    expect(valueOf(`{{ ${expression} }}`, data)).toEqual(expected);
  });

  test("short-circuits: the skipped side is never evaluated", () => {
    expect(valueOf("{{ true || nope }}")).toBe(true);
    expect(valueOf("{{ false && nope }}")).toBe(false);
    expect(valueOf("{{ true ? 1 : nope }}")).toBe(1);
  });

  test("filters pass null through, default fills it", () => {
    expect(valueOf("{{ user.missing | upper }}", data)).toBeNull();
    expect(valueOf("{{ user.missing | upper | default('-') }}", data)).toBe("-");
    expect(valueOf("{{ user.stats.stars | default(0) }}", data)).toBe(42);
    expect(valueOf("x{{ user.missing | number }}y", data)).toBe("xy");
  });
});
