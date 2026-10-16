import { expect, test } from "vitest";
import { applyDesignProps, type Design, validateDesign } from "../src/index.js";

const design: Design = {
  version: 0,
  canvas: { width: 100, height: 40 },
  components: {
    card: {
      props: {
        title: { type: "string", default: "" },
        size: { type: "number", default: 1 },
        kind: { type: "enum", values: ["a", "b"], default: "a" },
        tags: { type: "array", default: [] },
      },
      layers: [{ type: "rect", width: 10, height: 10, fill: "#000000" }],
    },
  },
  layers: [{ type: "component", ref: "card", props: { title: "literal", size: 2 } }],
};

function applied(props: Record<string, string | number | boolean | string[]>) {
  const result = applyDesignProps(design, props);
  if (!result.ok) throw new Error("expected success");
  return result.value;
}

function failed(props: Record<string, string | number | boolean | string[]>) {
  const result = applyDesignProps(design, props);
  if (result.ok) throw new Error("expected a failure");
  return result.issues;
}

test("sets a declared prop and keeps the others", () => {
  const value = applied({ kind: "b", tags: ["x", "y"] });
  expect(value.layers[0]).toMatchObject({
    props: { title: "literal", size: 2, kind: "b", tags: ["x", "y"] },
  });
  expect(validateDesign(value).ok).toBe(true);
});

test("the settings value wins over the layer's literal", () => {
  expect(applied({ title: "from settings" }).layers[0]).toMatchObject({
    props: { title: "from settings", size: 2 },
  });
});

test("a prop the component does not declare is an unknown-property issue at the prop", () => {
  const found = failed({ titel: "typo" });
  expect(found).toMatchObject([{ path: "/titel", code: "unknown-property" }]);
});

test("a wrong type or a value outside an enum is an issue at the prop, never echoing the value", () => {
  const found = failed({ size: "not-a-number-s3cret", kind: "zz-s3cret" });
  expect(found.map((issue) => [issue.path, issue.code])).toEqual([
    ["/size", "type"],
    ["/kind", "enum"],
  ]);
  expect(JSON.stringify(found)).not.toContain("s3cret");
});

test("a design without a top-level component layer takes no props", () => {
  const result = applyDesignProps({ ...design, layers: [] }, { title: "x" });
  expect(result).toMatchObject({ ok: false, issues: [{ path: "", code: "unknown-property" }] });
});

test("empty props return the design itself", () => {
  expect(applyDesignProps(design, {})).toEqual({ ok: true, value: design });
  expect((applyDesignProps(design, {}) as { value: Design }).value).toBe(design);
});

test("the input design is not changed", () => {
  const before = JSON.stringify(design);
  applied({ title: "changed" });
  expect(JSON.stringify(design)).toBe(before);
});

test("a bound value is accepted like one written in the design", () => {
  expect(applied({ title: "{{ user.name }}" }).layers[0]).toMatchObject({
    props: { title: "{{ user.name }}" },
  });
});
