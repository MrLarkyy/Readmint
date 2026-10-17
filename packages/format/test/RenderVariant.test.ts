import { expect, test } from "vitest";
import { renderVariant, renderVariants } from "../src/index.js";

test("dark sets the root prop theme to dark", () => {
  expect(renderVariant("dark")).toEqual({ name: "dark", props: { theme: "dark" } });
});

test("only exact table names resolve", () => {
  for (const name of ["Dark", "constructor", "__proto__", "toString", "", "dark "]) {
    expect(renderVariant(name)).toBeUndefined();
  }
});

test("the table is frozen", () => {
  expect(Object.isFrozen(renderVariants)).toBe(true);
  expect(Object.isFrozen(renderVariants[0])).toBe(true);
  expect(Object.isFrozen(renderVariants[0]?.props)).toBe(true);
});
