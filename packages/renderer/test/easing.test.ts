import { describe, expect, test } from "vitest";
import { bezierEasing, ease, keywordEasing, linearEasing } from "../src/easing.js";

// The CSS keyword curves at 0.25, 0.5 and 0.75, solved independently to 1e-6.
const reference = {
  ease: [0.408511, 0.802403, 0.960459],
  "ease-in": [0.093465, 0.315357, 0.621862],
  "ease-out": [0.378138, 0.684643, 0.906535],
  "ease-in-out": [0.129162, 0.5, 0.870838],
} as const;

describe("easing", () => {
  test.each(Object.entries(reference))("%s matches the CSS curve", (keyword, values) => {
    const curve = keywordEasing(keyword as keyof typeof reference);
    expect(curve.css).toBe(keyword);
    [0.25, 0.5, 0.75].forEach((progress, index) => {
      expect(Math.abs(ease(curve, progress) - (values[index] ?? 0))).toBeLessThan(1e-4);
    });
  });

  test("linear and the ends are exact", () => {
    expect(keywordEasing("linear")).toBe(linearEasing);
    expect(ease(linearEasing, 0.3)).toBe(0.3);
    const curve = keywordEasing("ease");
    expect(ease(curve, 0)).toBe(0);
    expect(ease(curve, 1)).toBe(1);
  });

  test("a cubic-bezier is rounded as the CSS prints it and may overshoot", () => {
    const curve = bezierEasing(0.12345, 2, 0.4, 2);
    expect(curve.css).toBe("cubic-bezier(0.123,2,0.4,2)");
    expect(curve.points).toEqual([0.123, 2, 0.4, 2]);
    expect(ease(curve, 0.5)).toBeGreaterThan(1);
    expect(ease(bezierEasing(0.3, -0.6, 0.7, 1), 0.1)).toBeLessThan(0);
  });

  test("the same curve gives the same bits on every call", () => {
    const curve = bezierEasing(0.3, 0.1, 0.7, 0.9);
    expect(ease(curve, 0.37)).toBe(ease(bezierEasing(0.3, 0.1, 0.7, 0.9), 0.37));
  });
});
