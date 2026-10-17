import { describe, expect, test } from "vitest";
import { defineGoldenSuite, type GoldenFixture } from "../src/GoldenSuite.js";
import { defaultBrowserTolerance, resolveTolerance } from "../src/GoldenTolerance.js";

const suite = (
  name = "demo",
  fixtures: GoldenFixture<string>[] = [{ name: "a", input: "" }],
  precision?: number,
) =>
  defineGoldenSuite<string>({
    name,
    render: (input) => input,
    fixtures,
    ...(precision === undefined ? {} : { precision }),
  });

describe("defineGoldenSuite", () => {
  test("accepts a valid suite and returns it", () => {
    expect(suite().name).toBe("demo");
  });

  test.each(["", "A", "-a", "a_b", "a/b", "../x", "a.b", "a b"])("rejects the name %j", (name) => {
    expect(() => suite(name)).toThrow(/suite name/);
    expect(() => suite("demo", [{ name, input: "" }])).toThrow(/fixture name/);
  });

  test("rejects duplicate fixtures, no fixtures and a scale outside 1..4", () => {
    expect(() =>
      suite("demo", [
        { name: "a", input: "" },
        { name: "a", input: "" },
      ]),
    ).toThrow(/repeats/);
    expect(() => suite("demo", [])).toThrow(/no fixtures/);
    expect(() => suite("demo", [{ name: "a", input: "", scale: 5 }])).toThrow(/scale/);
    expect(() => suite("demo", [{ name: "a", input: "", scale: 0 }])).toThrow(/scale/);
  });

  test("rejects a precision that is not a small integer", () => {
    expect(() => suite("demo", undefined, 1.5)).toThrow(/precision/);
    expect(() => suite("demo", undefined, 9)).toThrow(/precision/);
  });
});

describe("resolveTolerance", () => {
  test("merges over the defaults", () => {
    expect(resolveTolerance({ maxDiffRatio: 0.5 }, defaultBrowserTolerance)).toEqual({
      ...defaultBrowserTolerance,
      maxDiffRatio: 0.5,
    });
  });

  test("rejects values outside 0..1", () => {
    expect(() => resolveTolerance({ threshold: 2 }, defaultBrowserTolerance)).toThrow(RangeError);
    expect(() => resolveTolerance({ maxDiffRatio: -0.1 }, defaultBrowserTolerance)).toThrow(
      RangeError,
    );
    expect(() => resolveTolerance({ threshold: Number.NaN }, defaultBrowserTolerance)).toThrow(
      RangeError,
    );
  });

  test("rejects maxTileInk outside 0..1 and NaN", () => {
    for (const value of [-0.1, 1.1, Number.NaN]) {
      expect(() => resolveTolerance({ maxTileInk: value }, defaultBrowserTolerance)).toThrow(
        RangeError,
      );
    }
  });
});
