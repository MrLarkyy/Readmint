import { expect, test } from "vitest";
import * as expr from "../src/index.js";

test("exposes its package name", () => {
  expect(expr.packageName).toBe("@readmint/expr");
});

test("exports exactly the public API", () => {
  expect(Object.keys(expr).sort()).toEqual([
    "ExpressionLimits",
    "compileTemplate",
    "createBudget",
    "createScope",
    "evaluateCondition",
    "expandRepeat",
    "packageName",
  ]);
});

test("the limits are frozen and match the contract", () => {
  expect(Object.isFrozen(expr.ExpressionLimits)).toBe(true);
  expect(expr.ExpressionLimits).toEqual({
    maxSourceLength: 10_000,
    maxDepth: 64,
    maxSteps: 100_000,
    maxStringLength: 100_000,
    maxArrayLength: 10_000,
    maxFilterArgs: 4,
    maxEcho: 64,
  });
});
