import { afterEach, describe, expect, test, vi } from "vitest";
import { compileTemplate, createScope, expandRepeat } from "../src/index.js";
import { readProperty } from "../src/readProperty.js";
import { errorOf, evaluateText, valueOf } from "./evaluateText.js";

const data = { user: { name: "Ada" }, items: [1, 2, 3], text: "abc", count: 1 };

const prototypePaths = [
  "user.__proto__",
  "user.constructor",
  "user.constructor.constructor",
  "user.constructor.prototype",
  "user.toString",
  "user.hasOwnProperty",
  "user.valueOf",
  'user["__proto__"]',
  "user['constructor']['constructor']",
  'user["__defineGetter__"]',
  "items.length",
  "items.constructor",
  "items.push",
  "items['map']",
  "items.__proto__",
  "text.length",
  "text.constructor",
  "text.toUpperCase",
  "count.toFixed",
  "count.constructor.constructor",
  "[].constructor",
  "'x'.constructor",
  "(user).constructor",
];

describe("readProperty and the evaluator never reach a prototype", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(prototypePaths)("%s reads as null", (path) => {
    expect(valueOf(`{{ ${path} }}`, data)).toBeNull();
  });

  test.each(prototypePaths)("%s is never a function in text either", (path) => {
    expect(valueOf(`[{{ ${path} }}]`, data)).toBe("[]");
  });

  test.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "prototype"])(
    "the root name %s is unknown, not inherited",
    (name) => {
      expect(errorOf(`{{ ${name} }}`, data).code).toBe("unknown-name");
    },
  );

  test("an own data property named __proto__ (as JSON.parse makes it) is plain data", () => {
    const parsed = JSON.parse('{"o": {"__proto__": {"x": 1}}}') as Record<string, unknown>;
    expect(valueOf("{{ o.__proto__.x }}", parsed)).toBe(1);
    expect(valueOf("{{ o['__proto__'].x }}", parsed)).toBe(1);
  });

  test("a getter is never invoked: the read is invalid-data", () => {
    const getter = vi.fn(() => "secret");
    const user = {};
    Object.defineProperty(user, "name", { get: getter, enumerable: true });
    const arrayWithGetter = [1];
    Object.defineProperty(arrayWithGetter, 0, { get: getter });
    const root = {};
    Object.defineProperty(root, "user", { get: getter, enumerable: true });

    expect(errorOf("{{ user.name }}", { user }).code).toBe("invalid-data");
    expect(errorOf("{{ list[0] }}", { list: arrayWithGetter }).code).toBe("invalid-data");
    expect(errorOf("{{ user }}", root).code).toBe("invalid-data");
    expect(errorOf("{{ list | join }}", { list: arrayWithGetter }).code).toBe("invalid-data");
    expect(errorOf("{{ list | first }}", { list: arrayWithGetter }).code).toBe("invalid-data");
    const locals = {};
    Object.defineProperty(locals, "item", { get: getter, enumerable: true });
    const item = compileTemplate("{{ item }}");
    if (!item.ok) expect.fail(item.error.message);
    const fromLocal = item.value.evaluate(createScope({}).with(locals));
    expect(!fromLocal.ok && fromLocal.error.code).toBe("invalid-data");
    const template = compileTemplate("{{ list }}");
    if (!template.ok) expect.fail(template.error.message);
    const repeated = expandRepeat(template.value, createScope({ list: arrayWithGetter }));
    expect(!repeated.ok && repeated.error.code).toBe("invalid-data");
    expect(getter).not.toHaveBeenCalled();
  });

  test.each(["__proto__", "constructor", "toString"])(
    "max(%s) over objects never reaches a prototype",
    (key) => {
      expect(errorOf(`{{ list | max('${key}') }}`, { list: [{ count: 1 }] }).code).toBe("type");
    },
  );

  test("max with a key never invokes a getter and rejects a non-plain item", () => {
    const getter = vi.fn(() => 1);
    const item = {};
    Object.defineProperty(item, "count", { get: getter, enumerable: true });
    expect(errorOf("{{ list | max('count') }}", { list: [item] }).code).toBe("invalid-data");
    expect(errorOf("{{ list | min('count') }}", { list: [new Date(0)] }).code).toBe("invalid-data");
    expect(getter).not.toHaveBeenCalled();
  });

  test.each([
    [
      "a class instance",
      new (class Box {
        value = 1;
      })(),
    ],
    ["a function", () => 1],
    ["a Map", new Map([["a", 1]])],
    ["a Set", new Set([1])],
    ["a Date", new Date(0)],
    ["a RegExp", /x/],
    ["a typed array", new Uint8Array(2)],
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a bigint", 1n],
    ["a symbol", Symbol("s")],
    ["an array subclass", new (class List extends Array<number> {})()],
  ])("%s in the data is invalid-data", (_name, value) => {
    expect(errorOf("{{ v }}", { v: value }).code).toBe("invalid-data");
    expect(errorOf("{{ o.v }}", { o: { v: value } }).code).toBe("invalid-data");
    expect(errorOf("{{ a[0] }}", { a: [value] }).code).toBe("invalid-data");
  });

  test("a function is never called, even when its name is a filter", () => {
    const upper = vi.fn(() => "called");
    expect(errorOf("{{ o.upper }}", { o: { upper } }).code).toBe("invalid-data");
    expect(upper).not.toHaveBeenCalled();
  });

  test("an object with a null prototype is plain data", () => {
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, { x: 1 });
    expect(valueOf("{{ o.x }}", { o: bare })).toBe(1);
    expect(valueOf("{{ o.toString }}", { o: bare })).toBeNull();
  });

  test("Object.prototype and Array.prototype are unchanged after hostile evaluations", () => {
    const objectKeys = Object.getOwnPropertyNames(Object.prototype).sort();
    const arrayKeys = Object.getOwnPropertyNames(Array.prototype).sort();
    for (const path of prototypePaths) evaluateText(`{{ ${path} }}`, data);
    evaluateText("{{ user.__proto__.polluted }}", data);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(objectKeys);
    expect(Object.getOwnPropertyNames(Array.prototype).sort()).toEqual(arrayKeys);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  test("readProperty: arrays by integer index only, objects by own key", () => {
    expect(readProperty([1, 2], 1)).toEqual({ ok: true, value: 2 });
    expect(readProperty([1, 2], "1")).toEqual({ ok: true, value: null });
    expect(readProperty([1, 2], "length")).toEqual({ ok: true, value: null });
    expect(readProperty({ 2024: "y" }, 2024)).toEqual({ ok: true, value: "y" });
    expect(readProperty({ a: 1 }, "toString")).toEqual({ ok: true, value: null });
    expect(readProperty("abc", 0)).toEqual({ ok: true, value: null });
  });
});
