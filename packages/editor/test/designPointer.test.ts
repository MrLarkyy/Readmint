import { describe, expect, test } from "vitest";
import { childPointer, getAt, parsePointer, setAt, splitPointer } from "../src/designPointer.js";

describe("parsePointer", () => {
  test("decodes RFC 6901 escapes", () => {
    expect(parsePointer("/a~1b/c~0d/0")).toEqual(["a/b", "c~d", "0"]);
    expect(parsePointer("")).toEqual([]);
    expect(parsePointer("a")).toBeUndefined();
  });

  test.each(["/__proto__", "/layers/0/constructor", "/a/prototype/b"])("refuses %s", (pointer) => {
    expect(parsePointer(pointer)).toBeUndefined();
  });

  test("childPointer and splitPointer are its inverse", () => {
    const pointer = childPointer(childPointer("/assets/fonts", "a/b~c"), "src");
    expect(parsePointer(pointer)).toEqual(["assets", "fonts", "a/b~c", "src"]);
    expect(splitPointer(pointer)).toEqual({ parent: "/assets/fonts/a~1b~0c", key: "src" });
  });
});

describe("getAt", () => {
  test("reads own properties and array items only", () => {
    const value = { a: [{ b: 1 }] };
    expect(getAt(value, "/a/0/b")).toBe(1);
    expect(getAt(value, "/a/1")).toBeUndefined();
    expect(getAt(value, "/a/01")).toBeUndefined();
    expect(getAt(value, "/toString")).toBeUndefined();
    expect(getAt(value, "/__proto__")).toBeUndefined();
  });
});

describe("setAt", () => {
  test("copies the path and leaves the original untouched", () => {
    const original = { a: { b: 1, c: [1, 2] }, d: { e: 1 } };
    const frozen = structuredClone(original);
    const next = setAt(original, "/a/c/1", 5);
    expect(next).toEqual({ a: { b: 1, c: [1, 5] }, d: { e: 1 } });
    expect(original).toEqual(frozen);
    expect(next?.d).toBe(original.d);
    expect(next?.a).not.toBe(original.a);
  });

  test("adds and removes object keys, keeping the key order", () => {
    expect(Object.keys(setAt({ a: 1, b: 2 }, "/a", 3) ?? {})).toEqual(["a", "b"]);
    expect(setAt({ a: 1 }, "/b", 2)).toEqual({ a: 1, b: 2 });
    expect(setAt({ a: 1, b: 2 }, "/a", undefined)).toEqual({ b: 2 });
    expect(setAt({ a: [1, 2, 3] }, "/a/1", undefined)).toEqual({ a: [1, 3] });
  });

  test("refuses a missing parent, an index out of range and prototype segments", () => {
    expect(setAt({ a: 1 }, "/b/c", 1)).toBeUndefined();
    expect(setAt({ a: [1] }, "/a/1", 2)).toBeUndefined();
    expect(setAt({}, "/__proto__/polluted", true)).toBeUndefined();
    expect(setAt({ a: {} }, "/a/constructor", 1)).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("a key named like an Object.prototype member becomes an own property", () => {
    const next = setAt({}, "/toString", 1) as Record<string, unknown>;
    expect(Object.hasOwn(next, "toString")).toBe(true);
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
  });
});
