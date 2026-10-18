import { describe, expect, test } from "vitest";
import { compileTemplate, createBudget, createScope, type ExprValue } from "../src/index.js";
import { errorOf, valueOf } from "./evaluateText.js";

const languages = [
  { name: "TypeScript", share: 0.5 },
  { name: "Rust", share: 0.3 },
  { name: "Go", share: 0.2 },
];

/** Evaluates `text` against `data` on a budget of `maxSteps`; the result and the steps it used. */
function charged(
  text: string,
  data: Readonly<Record<string, unknown>>,
  maxSteps?: number,
): { readonly ok: boolean; readonly code?: string; readonly used: number } {
  const template = compileTemplate(text);
  if (!template.ok) expect.fail(template.error.message);
  const budget = createBudget(maxSteps);
  const result = template.value.evaluate(createScope(data, { budget }));
  return result.ok
    ? { ok: true, used: budget.used }
    : { ok: false, code: result.error.code, used: budget.used };
}

describe("exclude", () => {
  test("drops the items whose key equals a value, in order", () => {
    expect(valueOf("{{ langs | exclude('name', ['Rust']) }}", { langs: languages })).toEqual([
      languages[0],
      languages[2],
    ]);
    expect(
      valueOf("{{ langs | exclude('name', ['Go', 'TypeScript']) }}", { langs: languages }),
    ).toEqual([languages[1]]);
  });

  test("with a null key compares the items themselves, by type and value", () => {
    expect(valueOf("{{ [1, '1', true, null, 2] | exclude(null, [1, null]) }}")).toEqual([
      "1",
      true,
      2,
    ]);
    expect(valueOf("{{ ['a', 'A'] | exclude(null, ['a']) }}")).toEqual(["A"]);
  });

  test("keeps every item when nothing matches, and gives an empty list for an empty input", () => {
    expect(valueOf("{{ langs | exclude('name', []) }}", { langs: languages })).toEqual(languages);
    expect(
      valueOf("{{ langs | exclude('name', ['typescript', 'Python']) }}", { langs: languages }),
    ).toEqual(languages);
    expect(valueOf("{{ [] | exclude('name', ['Go']) }}")).toEqual([]);
  });

  test("returns a new array and leaves the input unchanged", () => {
    const langs = languages.map((language) => ({ ...language }));
    const copy = structuredClone(langs);
    const kept = valueOf("{{ langs | exclude('name', ['Rust']) }}", { langs });
    expect(kept).not.toBe(langs);
    expect(langs).toEqual(copy);
    expect(valueOf("{{ langs | exclude('name', []) }}", { langs })).not.toBe(langs);
  });

  test("reads a missing property as null and keeps an item whose key value is a container", () => {
    const items = [{ name: "a" }, {}, { name: ["a"] }, { name: { a: 1 } }];
    expect(valueOf("{{ items | exclude('name', [null]) }}", { items })).toEqual([
      items[0],
      items[2],
      items[3],
    ]);
    expect(valueOf("{{ items | exclude('name', ['a']) }}", { items })).toEqual([
      items[1],
      items[2],
      items[3],
    ]);
  });

  test("reads only own properties: __proto__ and constructor keys are null", () => {
    const items = [{ name: "a" }];
    expect(valueOf("{{ items | exclude('constructor', [null]) }}", { items })).toEqual([]);
    expect(valueOf("{{ items | exclude('__proto__', [null]) }}", { items })).toEqual([]);
    expect(valueOf("{{ items | exclude('toString', ['a']) | length }}", { items })).toBe(1);
  });

  test.each([
    ["{{ 5 | exclude('name', []) }}", "type"],
    ["{{ 'abc' | exclude(null, ['a']) }}", "type"],
    ["{{ [1, 2] | exclude('name', [1]) }}", "type"],
    ["{{ [[1]] | exclude('name', [1]) }}", "type"],
    ["{{ langs | exclude(1, ['Go']) }}", "argument"],
    ["{{ langs | exclude('name', 'Go') }}", "argument"],
    ["{{ langs | exclude('name', null) }}", "argument"],
    ["{{ langs | exclude('name', [['Go']]) }}", "argument"],
    ["{{ langs | exclude('name', [langs[0]]) }}", "argument"],
    ["{{ langs | exclude('name') }}", "argument"],
  ])("%s is a %s error", (text, code) => {
    expect(errorOf(text, { langs: languages }).code).toBe(code);
  });

  test("passes a null input through", () => {
    expect(valueOf("{{ missing | exclude('name', ['Go']) }}", { missing: null })).toBeNull();
  });

  test("an item that is not a JSON value is invalid-data", () => {
    const items = [Object.create({ name: "a" }) as unknown];
    expect(errorOf("{{ items | exclude('name', ['a']) }}", { items }).code).toBe("invalid-data");
    const values = [new Date(0)] as unknown[];
    expect(
      errorOf("{{ langs | exclude('name', values) }}", { langs: languages, values }).code,
    ).toBe("invalid-data");
  });

  test("charges one step per item and per value, plus the key and long strings", () => {
    const base = charged("{{ list | exclude('name', hide) }}", { list: [], hide: [] }).used;
    const list = Array.from({ length: 1000 }, (_, index) => ({ name: String(index) }));
    const hide = Array.from({ length: 500 }, (_, index) => String(index));
    expect(charged("{{ list | exclude('name', hide) }}", { list, hide }).used - base).toBe(1500);
    const long = "x".repeat(160);
    expect(
      charged("{{ list | exclude('name', hide) }}", { list: [{ name: long }], hide: [long] }).used -
        base,
    ).toBe(2 + 2 * 10);
  });

  test("10000 items against 10000 values stay within the default budget", () => {
    const list = Array.from({ length: 10_000 }, (_, index) => ({ name: `lang-${String(index)}` }));
    const hide = Array.from({ length: 10_000 }, (_, index) => `lang-${String(index * 2)}`);
    const result = charged("{{ list | exclude('name', hide) | length }}", { list, hide });
    expect(result.ok).toBe(true);
    expect(result.used).toBeLessThan(25_000);
    expect(valueOf("{{ list | exclude('name', hide) | length }}", { list, hide })).toBe(5000);
  });

  test("a small shared budget fails before the work", () => {
    const list = Array.from({ length: 10_000 }, () => ({ name: "a" }));
    const result = charged("{{ list | exclude('name', hide) }}", { list, hide: ["a"] }, 5000);
    expect(result).toMatchObject({ ok: false, code: "budget" });
  });
});

describe("sum", () => {
  test.each<[string, ExprValue]>([
    ["{{ [1, 2, 3.5] | sum }}", 6.5],
    ["{{ [] | sum }}", 0],
    ["{{ [] | sum('share') }}", 0],
    ["{{ [0.1, 0.2] | sum }}", 0.30000000000000004],
    ["{{ langs | sum('share') }}", 1],
    ["{{ langs | exclude('name', ['TypeScript']) | sum('share') }}", 0.5],
  ])("%s is %j", (text, expected) => {
    expect(valueOf(text, { langs: languages })).toBe(expected);
  });

  test("adds left to right", () => {
    // (1e16 + 1) + 1 loses both ones; a different order would keep them.
    expect(valueOf("{{ [1e16, 1, 1] | sum }}")).toBe(1e16);
  });

  test.each([
    ["{{ 5 | sum }}", "type"],
    ["{{ 'abc' | sum }}", "type"],
    ["{{ [1, '2'] | sum }}", "type"],
    ["{{ langs | sum }}", "type"],
    ["{{ langs | sum('name') }}", "type"],
    ["{{ langs | sum('missing') }}", "type"],
    ["{{ [1, 2] | sum('share') }}", "type"],
    ["{{ langs | sum(1) }}", "argument"],
    ["{{ [1e308, 1e308] | sum }}", "not-finite"],
  ])("%s is a %s error", (text, code) => {
    expect(errorOf(text, { langs: languages }).code).toBe(code);
  });

  test("passes a null input through", () => {
    expect(valueOf("{{ missing | sum }}", { missing: null })).toBeNull();
  });

  test("charges one step per item plus the key once", () => {
    const base = charged("{{ list | sum('count') }}", { list: [] }).used;
    const list = new Array(1000).fill({ count: 2 }) as unknown[];
    expect(charged("{{ list | sum('count') }}", { list }).used - base).toBe(1000);
  });

  test("200000 items exhaust the default budget before the sum", () => {
    const result = charged("{{ list | sum }}", { list: new Array<number>(200_000).fill(1) });
    expect(result).toMatchObject({ ok: false, code: "budget" });
  });
});
