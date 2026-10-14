import { describe, expect, test } from "vitest";
import {
  compileTemplate,
  createBudget,
  createScope,
  evaluateCondition,
  expandRepeat,
  type Scope,
  type Template,
} from "../src/index.js";

function compile(text: string): Template {
  const template = compileTemplate(text);
  if (!template.ok) expect.fail(template.error.message);
  return template.value;
}

function read(text: string, scope: Scope): unknown {
  const result = compile(text).evaluate(scope);
  if (!result.ok) expect.fail(result.error.message);
  return result.value;
}

describe("scope", () => {
  test("locals shadow data and the parent scope is unchanged", () => {
    const scope = createScope({ name: "data", other: 1 });
    const child = scope.with({ name: "local" });
    expect(read("{{ name }}", child)).toBe("local");
    expect(read("{{ other }}", child)).toBe(1);
    expect(read("{{ name }}", scope)).toBe("data");
    const grandchild = child.with({ other: 2 });
    expect(read("{{ name }}-{{ other }}", grandchild)).toBe("local-2");
    expect(read("{{ other }}", child)).toBe(1);
  });

  test("a scope is frozen and copies the locals it is given", () => {
    const locals: Record<string, unknown> = { a: 1 };
    const scope = createScope({}).with(locals);
    locals["a"] = 2;
    expect(read("{{ a }}", scope)).toBe(1);
    expect(Object.isFrozen(scope)).toBe(true);
  });

  test("component props are read through a local", () => {
    const scope = createScope({}).with({ props: { "my-label": "Stars", count: 3 } });
    expect(read("{{ props.my-label }}: {{ props.count }}", scope)).toBe("Stars: 3");
  });

  test("a local named like an Object.prototype member is plain data", () => {
    const scope = createScope({}).with({ constructor: "c", ["__proto__"]: "p" });
    expect(read("{{ constructor }}", scope)).toBe("c");
    expect(read("{{ __proto__ }}", scope)).toBe("p");
  });

  test("data that is not a plain object makes every data name invalid", () => {
    const result = compile("{{ a }}").evaluate(createScope(new Map() as never));
    expect(!result.ok && result.error.code).toBe("invalid-data");
  });

  test("children share the budget and the locale", () => {
    const budget = createBudget();
    const scope = createScope({}, { locale: "de", budget }).with({ n: 1234 });
    expect(scope.budget).toBe(budget);
    expect(scope.locale).toBe("de");
    expect(read("{{ n | number }}", scope)).toBe("1.234");
    expect(budget.used).toBeGreaterThan(0);
  });
});

describe("evaluateCondition", () => {
  test.each([
    ["false", false],
    ["null", false],
    ["0", false],
    ["-0", false],
    ["''", false],
    ["[]", false],
    ["true", true],
    ["1", true],
    ["-1", true],
    ["'0'", true],
    ["'false'", true],
    ["[0]", true],
    ["o", true],
    ["e", true],
  ])("%s is %s", (expression, expected) => {
    const scope = createScope({ o: { a: 1 }, e: {} });
    expect(evaluateCondition(compile(`{{ ${expression} }}`), scope)).toEqual({
      ok: true,
      value: expected,
    });
  });

  test("passes an evaluation error through", () => {
    const result = evaluateCondition(compile("{{ nope }}"), createScope({}));
    expect(!result.ok && result.error.code).toBe("unknown-name");
  });
});

describe("expandRepeat", () => {
  const data = { repos: [{ name: "a" }, { name: "b" }, { name: "c" }] };

  test("exposes item and a 0-based index by default", () => {
    const result = expandRepeat(compile("{{ repos }}"), createScope(data));
    if (!result.ok) expect.fail(result.error.message);
    expect(result.value.map((scope) => read("{{ index }}:{{ item.name }}", scope))).toEqual([
      "0:a",
      "1:b",
      "2:c",
    ]);
  });

  test("uses custom as and index names, including hyphenated ids", () => {
    const result = expandRepeat(compile("{{ repos }}"), createScope(data), {
      as: "repo",
      index: "repo-index",
    });
    if (!result.ok) expect.fail(result.error.message);
    expect(
      result.value.map((scope) => read("{{ repo-index + 1 }}. {{ repo.name }}", scope)),
    ).toEqual(["1. a", "2. b", "3. c"]);
  });

  test("child scopes keep the outer locals and data", () => {
    const outer = createScope({ ...data, title: "T" }).with({ row: 7 });
    const result = expandRepeat(compile("{{ repos }}"), outer);
    if (!result.ok) expect.fail(result.error.message);
    expect(read("{{ title }} {{ row }} {{ item.name }}", result.value[1] as Scope)).toBe("T 7 b");
  });

  test("an empty array or null repeats nothing", () => {
    expect(expandRepeat(compile("{{ [] }}"), createScope({}))).toEqual({ ok: true, value: [] });
    expect(expandRepeat(compile("{{ x.missing }}"), createScope({ x: {} }))).toEqual({
      ok: true,
      value: [],
    });
  });

  test.each([
    ["{{ 'abc' }}", "type"],
    ["{{ o }}", "type"],
    ["{{ repos }} ", "type"],
    ["{{ nope }}", "unknown-name"],
  ])("%s fails with %s", (text, code) => {
    const result = expandRepeat(compile(text), createScope({ ...data, o: {} }));
    expect(!result.ok && result.error.code).toBe(code);
  });

  test.each([
    ["repo-1", "i"],
    ["1st", "i"],
    ["true", "i"],
    ["null", "i"],
    ["", "i"],
    ["a b", "i"],
    ["repo", "-i"],
    ["repo", "i-"],
    ["repo", "é"],
  ])("a name an expression cannot read is an argument error: as %j, index %j", (as, index) => {
    const result = expandRepeat(compile("{{ repos }}"), createScope(data), { as, index });
    expect(!result.ok && result.error.code).toBe("argument");
  });

  test.each([["repo-index"], ["_x"], ["a_1"], ["my-item-x2"], ["trueish"]])(
    "%s is a readable repeat name",
    (name) => {
      const result = expandRepeat(compile("{{ repos }}"), createScope(data), { as: name });
      if (!result.ok) expect.fail(result.error.message);
      expect(read(`{{ ${name}.name }}`, result.value[0] as Scope)).toBe("a");
    },
  );

  test("the item and the index need different names", () => {
    const result = expandRepeat(compile("{{ repos }}"), createScope(data), { as: "x", index: "x" });
    expect(!result.ok && result.error.code).toBe("argument");
  });

  test("charges a shared budget per item", () => {
    const budget = createBudget(3);
    const result = expandRepeat(compile("{{ repos }}"), createScope(data, { budget }));
    expect(!result.ok && result.error.code).toBe("budget");
  });
});
