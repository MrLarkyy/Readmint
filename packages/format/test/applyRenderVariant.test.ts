import { expect, test } from "vitest";
import { applyRenderVariant, type Design, renderVariant } from "../src/index.js";

function design(prop?: object): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 40 },
    components: {
      card: {
        ...(prop === undefined ? {} : { props: { theme: prop } }),
        layers: [{ type: "rect", width: 10, height: 10, fill: "#000000" }],
      },
    },
    layers: [
      {
        type: "component",
        ref: "card",
        ...(prop === undefined ? {} : { props: { theme: "light" } }),
      },
    ],
  } as Design;
}

const secret = { name: "x", props: { theme: "s3cret" } };

function issues(source: Design, variant = secret) {
  const result = applyRenderVariant(source, variant);
  if (result.ok) throw new Error("expected a failure");
  return result.issues;
}

test("a design without the prop fails with a fixed message", () => {
  const found = issues(design());
  expect(found).toEqual([
    {
      path: "/theme",
      code: "unknown-property",
      message: 'variant x: no top-level component of the design has the prop "theme"',
    },
  ]);
  expect(JSON.stringify(found)).not.toContain("s3cret");
});

test("a value outside the enum is reported without the value", () => {
  const found = issues(design({ type: "enum", values: ["light", "dark"], default: "light" }));
  expect(found[0]?.code).toBe("enum");
  expect(found[0]?.message).toBe("variant x: the value is not one of the prop's allowed values");
  expect(JSON.stringify(found)).not.toContain("s3cret");
});

test("a value of the wrong type is reported without the value", () => {
  const found = issues(design({ type: "number", default: 1 }));
  expect(found[0]?.code).toBe("type");
  expect(found[0]?.message).toBe("variant x: the value has the wrong type for the prop");
  expect(JSON.stringify(found)).not.toContain("s3cret");
});

test("dark sets the layer literal and leaves the input alone", () => {
  const source = design({ type: "enum", values: ["light", "dark"], default: "light" });
  const before = JSON.stringify(source);
  const variant = renderVariant("dark");
  if (variant === undefined) throw new Error("no dark variant");
  const result = applyRenderVariant(source, variant);
  if (!result.ok) throw new Error("expected success");
  expect(result.value.layers[0]).toMatchObject({ props: { theme: "dark" } });
  expect(JSON.stringify(source)).toBe(before);
});
