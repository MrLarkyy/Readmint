import { expect, test } from "vitest";
import { DesignLimits, parseDesignProps } from "../src/index.js";

function issues(source: string) {
  const result = parseDesignProps(source);
  if (result.ok) throw new Error("expected a failure");
  return result.issues;
}

test("reads sections of scalar and list props", () => {
  const result = parseDesignProps(
    JSON.stringify({
      header: { name: "Ada", size: 3, on: true, tags: ["a", 1, false] },
      stack: {},
    }),
  );
  expect(result).toEqual({
    ok: true,
    value: { header: { name: "Ada", size: 3, on: true, tags: ["a", 1, false] }, stack: {} },
  });
});

test("a leading byte order mark is ignored", () => {
  expect(parseDesignProps(`\ufeff{"a":{"b":1}}`)).toMatchObject({ ok: true });
});

test.each([["[]"], ['"text"'], ["3"], ["null"]])("the root %s is not an object", (source) => {
  expect(issues(source)).toMatchObject([{ path: "", code: "type" }]);
});

test.each([["__proto__"], ["1a"], ["a".repeat(65)], ["a b"]])(
  "the section key %s is refused",
  (key) => {
    const result = parseDesignProps(`{${JSON.stringify(key)}:{}}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("pattern");
  },
);

test("a prop key follows the id pattern", () => {
  expect(issues('{"a":{"__proto__":1}}')).toMatchObject([{ code: "pattern" }]);
});

test("constructor is plain data, never the object's own constructor", () => {
  const result = parseDesignProps('{"constructor":{"constructor":"x"}}');
  if (!result.ok) throw new Error("expected success");
  expect(Object.hasOwn(result.value, "constructor")).toBe(true);
  expect(Object.getPrototypeOf(result.value)).toBeNull();
  expect(result.value["constructor"]?.["constructor"]).toBe("x");
});

test("a nested object, a list holding an object and a null are refused at the prop", () => {
  expect(issues('{"a":{"b":{"c":1}}}')).toMatchObject([{ path: "/a/b", code: "type" }]);
  expect(issues('{"a":{"b":[{"c":1}]}}')).toMatchObject([{ path: "/a/b", code: "type" }]);
  expect(issues('{"a":{"b":null}}')).toMatchObject([{ path: "/a/b", code: "type" }]);
});

test("a section that is not an object is refused", () => {
  expect(issues('{"a":3}')).toMatchObject([{ path: "/a", code: "type" }]);
});

test("a source over the limit is refused before parsing", () => {
  expect(issues(" ".repeat(DesignLimits.maxSourceLength + 1))).toMatchObject([
    { path: "", code: "too-large" },
  ]);
});

test("invalid JSON reports a position and never quotes the source", () => {
  const found = issues('{"a":{"secretvalue": tru}}');
  expect(found[0]).toMatchObject({ code: "parse", line: 1 });
  expect(JSON.stringify(found)).not.toContain("secretvalue");
});

test("a value never appears in a message", () => {
  expect(JSON.stringify(issues('{"a":{"b":{"hidden-text":"s3cret"}}}'))).not.toContain("s3cret");
});
