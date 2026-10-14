import { describe, expect, test } from "vitest";
import {
  compileTemplate,
  createBudget,
  createScope,
  expandRepeat,
  ExpressionLimits,
  type ExpressionErrorCode,
} from "../src/index.js";

const wallClockMs = 1000;

/**
 * Evaluates `text` with a budget we can inspect; the error code must match, the steps must stay
 * within the default budget (plus the single overrunning charge) and the run must finish quickly.
 */
function expectBounded(
  text: string,
  data: Readonly<Record<string, unknown>>,
  code: ExpressionErrorCode,
): void {
  const started = performance.now();
  const budget = createBudget();
  const template = compileTemplate(text);
  const result = template.ok ? template.value.evaluate(createScope(data, { budget })) : template;
  const elapsed = performance.now() - started;
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  expect(result.error.excerpt.length).toBeLessThanOrEqual(ExpressionLimits.maxEcho);
  expect(result.error.message.length).toBeLessThan(200);
  expect(budget.used).toBeLessThanOrEqual(ExpressionLimits.maxSteps + 1_000_001);
  expect(elapsed).toBeLessThan(wallClockMs);
}

const long = "x".repeat(60_000);

describe("hostile expressions are bounded in time and memory", () => {
  test.each([
    ["parentheses", "(".repeat(4990) + "1" + ")".repeat(4990)],
    ["array literals", "[".repeat(4990) + "]".repeat(4990)],
    ["index brackets", "a" + "[a".repeat(3000) + "]".repeat(3000)],
    ["unary operators", "!".repeat(9900) + "1"],
    ["minus signs", "- ".repeat(4900) + "1"],
    ["conditionals", "a ? ".repeat(1200) + "1" + " : 2".repeat(1200)],
    ["filter arguments", "a | default(".repeat(700) + "1" + ")".repeat(700)],
  ])("10000 characters of nested %s fail too-deep without a RangeError", (_name, expression) => {
    const text = `{{${expression}}}`;
    expect(text.length).toBeLessThanOrEqual(ExpressionLimits.maxSourceLength);
    expectBounded(text, { a: 1 }, "too-deep");
  });

  test(`nesting up to ${String(ExpressionLimits.maxDepth)} levels is fine`, () => {
    const depth = ExpressionLimits.maxDepth;
    const template = compileTemplate(`{{${"(".repeat(depth)}1${")".repeat(depth)}}}`);
    expect(template.ok).toBe(true);
  });

  test("long flat chains evaluate by a loop, not by recursion", () => {
    const sum = compileTemplate(`{{ 0${" + 1".repeat(2400)} }}`);
    if (!sum.ok) expect.fail(sum.error.message);
    expect(sum.value.evaluate(createScope({}))).toEqual({ ok: true, value: 2400 });
    const path = compileTemplate(`{{ a${".b".repeat(4900)} }}`);
    if (!path.ok) expect.fail(path.error.message);
    expect(path.value.evaluate(createScope({ a: {} }))).toEqual({ ok: true, value: null });
    const pipes = compileTemplate(`{{ "a"${" | trim".repeat(1400)} }}`);
    if (!pipes.ok) expect.fail(pipes.error.message);
    expect(pipes.value.evaluate(createScope({}))).toEqual({ ok: true, value: "a" });
  });

  test("a + chain over a 60000-character string is too-large before it is built", () => {
    expectBounded("{{ s + s + s + s }}", { s: long }, "too-large");
  });

  test("a text template that would pass the string limit is too-large", () => {
    expectBounded("{{ s }}{{ s }}", { s: long }, "too-large");
  });

  test("1000 chained | upper exhaust the budget", () => {
    expectBounded(`{{ s${" | upper".repeat(1000)} }}`, { s: long }, "budget");
  });

  test("join over a million items exhausts the budget before joining", () => {
    expectBounded("{{ list | join }}", { list: new Array<number>(1_000_000).fill(1) }, "budget");
  });

  test("padStart to a billion is too-large before allocating", () => {
    expectBounded("{{ 'x' | padStart(1000000000) }}", {}, "too-large");
    expectBounded("{{ 'x' | padStart(100001) }}", {}, "too-large");
    expectBounded("{{ s | padStart(100000, '\u{1F600}') }}", { s: "" }, "too-large");
  });

  test("a 10000-element array literal does not fit the source limit", () => {
    expectBounded(`{{ [${"1,".repeat(9999)}1] }}`, {}, "too-long");
  });

  test("a 4000-element array literal within the source limit evaluates", () => {
    const template = compileTemplate(`{{ [${"1,".repeat(3999)}1] | length }}`);
    if (!template.ok) expect.fail(template.error.message);
    expect(template.value.evaluate(createScope({}))).toEqual({ ok: true, value: 4000 });
  });

  test(`repeat over ${String(ExpressionLimits.maxArrayLength + 1)} items is too-large`, () => {
    const template = compileTemplate("{{ list }}");
    if (!template.ok) expect.fail(template.error.message);
    const list = new Array<number>(ExpressionLimits.maxArrayLength + 1).fill(0);
    const result = expandRepeat(template.value, createScope({ list }));
    expect(!result.ok && result.error.code).toBe("too-large");
    const atLimit = expandRepeat(template.value, createScope({ list: list.slice(1) }));
    expect(atLimit.ok && atLimit.value.length).toBe(ExpressionLimits.maxArrayLength);
  });

  test("a shared budget is exhausted across evaluations and stays exhausted", () => {
    const budget = createBudget(50);
    const scope = createScope({ a: 1 }, { budget });
    const template = compileTemplate("{{ a + a + a + a }}");
    if (!template.ok) expect.fail(template.error.message);
    const codes: string[] = [];
    for (let run = 0; run < 12; run++) {
      const result = template.value.evaluate(scope);
      codes.push(result.ok ? "ok" : result.error.code);
    }
    // Five steps a run (the chain and its four names): ten runs fit in 50 steps.
    expect(codes).toEqual([...new Array<string>(10).fill("ok"), "budget", "budget"]);
    expect(budget.exhausted).toBe(true);
    const child = scope.with({ b: 2 });
    const other = compileTemplate("{{ b }}");
    if (!other.ok) expect.fail(other.error.message);
    expect(!other.value.evaluate(child).ok).toBe(true);
  });

  test("without a shared budget every evaluation gets a fresh one", () => {
    const template = compileTemplate(`{{ s${" | upper".repeat(20)} }}`);
    if (!template.ok) expect.fail(template.error.message);
    const scope = createScope({ s: "x".repeat(50_000) });
    for (let run = 0; run < 3; run++) expect(template.value.evaluate(scope).ok).toBe(true);
  });

  test("createBudget refuses a negative or fractional step count", () => {
    expect(() => createBudget(-1)).toThrow(RangeError);
    expect(() => createBudget(1.5)).toThrow(RangeError);
  });

  test("a long hostile source scans in linear time", () => {
    const started = performance.now();
    for (const filler of ['"', "'", "a-".repeat(10), "1e", "{{", "}"]) {
      compileTemplate(`{{ ${filler.repeat(9990 / filler.length)}`);
    }
    expect(performance.now() - started).toBeLessThan(wallClockMs);
  });
});
