import { describe, expect, test } from "vitest";
import { createBudget, createScope, compileTemplate, type TextMeasurer } from "../src/index.js";
import { errorOf, valueOf } from "./evaluateText.js";

const secret = "s3cr3t-value";

/** Half the size per code point plus the letter spacing, for the font `mono` only; records every call. */
function fakeMeasurer(calls: string[] = []): TextMeasurer {
  const width = (text: string, size: number, spacing: number) =>
    Array.from(text).length * (size / 2 + spacing);
  return {
    width(text, font, size, letterSpacing) {
      calls.push(`width ${font} ${String(size)} ${String(letterSpacing)} ${text}`);
      return font === "mono" ? width(text, size, letterSpacing) : undefined;
    },
    truncate(text, max, font, size, letterSpacing) {
      calls.push(
        `truncate ${String(max)} ${font} ${String(size)} ${String(letterSpacing)} ${text}`,
      );
      if (font !== "mono") return undefined;
      if (width(text, size, letterSpacing) <= max) return text;
      const kept = Array.from(text);
      while (kept.length > 0 && width(`${kept.join("")}…`, size, letterSpacing) > max) kept.pop();
      return width("…", size, letterSpacing) > max ? "" : `${kept.join("")}…`;
    },
  };
}

const measured = (calls?: string[]) => ({ measurer: fakeMeasurer(calls) });

describe("textWidth and truncateWidth", () => {
  test("textWidth gives the measurer's width; letter spacing defaults to 0", () => {
    const calls: string[] = [];
    expect(valueOf("{{ 'abcd' | textWidth('mono', 10) }}", {}, measured(calls))).toBe(20);
    expect(valueOf("{{ 'abcd' | textWidth('mono', 10, 1.5) }}", {}, measured(calls))).toBe(26);
    expect(valueOf("{{ '' | textWidth('mono', 10) }}", {}, measured())).toBe(0);
    expect(calls).toEqual(["width mono 10 0 abcd", "width mono 10 1.5 abcd"]);
  });

  test("truncateWidth gives the measurer's cut, the text unchanged when it fits, '' when … does not fit", () => {
    const options = measured();
    expect(valueOf("{{ 'abcdef' | truncateWidth(30, 'mono', 10) }}", {}, options)).toBe("abcdef");
    expect(valueOf("{{ 'abcdef' | truncateWidth(20, 'mono', 10) }}", {}, options)).toBe("abc…");
    expect(valueOf("{{ 'abcdef' | truncateWidth(4, 'mono', 10) }}", {}, options)).toBe("");
    expect(valueOf("{{ 'abcdef' | truncateWidth(0, 'mono', 10, 1) }}", {}, options)).toBe("");
  });

  test("a null input passes through without measuring", () => {
    const calls: string[] = [];
    expect(valueOf("{{ v | textWidth('mono', 10) }}", { v: null }, measured(calls))).toBeNull();
    expect(
      valueOf("{{ v | truncateWidth(9, 'mono', 10) }}", { v: null }, measured(calls)),
    ).toBeNull();
    expect(calls).toEqual([]);
  });

  test("child scopes carry the measurer", () => {
    const template = compileTemplate("{{ name | textWidth('mono', 4) }}");
    if (!template.ok) throw new Error(template.error.message);
    const scope = createScope({}, measured()).with({ name: "abc" });
    expect(template.value.evaluate(scope)).toEqual({ ok: true, value: 6 });
  });

  test("without a measurer both are unknown-filter, naming the renderer", () => {
    for (const expression of [
      "{{ 'a' | textWidth('mono', 10) }}",
      "{{ 'a' | truncateWidth(9, 'mono', 10) }}",
    ]) {
      const error = errorOf(expression);
      expect(error.code).toBe("unknown-filter");
      expect(error.message).toContain("needs a renderer");
    }
  });

  test.each([
    ["{{ 12 | textWidth('mono', 10) }}", "type"],
    ["{{ ['a'] | truncateWidth(9, 'mono', 10) }}", "type"],
    ["{{ s | textWidth(1, 10) }}", "argument"],
    ["{{ s | textWidth('mono') }}", "argument"],
    ["{{ s | textWidth('mono', 0) }}", "argument"],
    ["{{ s | textWidth('mono', -1) }}", "argument"],
    ["{{ s | textWidth('mono', 1001) }}", "argument"],
    ["{{ s | textWidth('mono', '10') }}", "argument"],
    ["{{ s | textWidth('mono', 10, 101) }}", "argument"],
    ["{{ s | textWidth('mono', 10, -101) }}", "argument"],
    ["{{ s | textWidth('mono', 10, 'x') }}", "argument"],
    ["{{ s | textWidth('mono', 10, 0, 1) }}", "argument"],
    ["{{ s | truncateWidth(-1, 'mono', 10) }}", "argument"],
    ["{{ s | truncateWidth('9', 'mono', 10) }}", "argument"],
    ["{{ s | truncateWidth(9, 'mono', 0) }}", "argument"],
    ["{{ s | truncateWidth(9, 'mono', 10, 200) }}", "argument"],
    ["{{ s | textWidth(s, 10) }}", "argument"],
    ["{{ s | textWidth('__proto__', 10) }}", "argument"],
    ["{{ s | truncateWidth(9, 'constructor', 10) }}", "argument"],
  ])("%s is a %s error that does not echo the data", (expression, code) => {
    const error = errorOf(expression, { s: secret }, measured());
    expect(error.code).toBe(code);
    expect(error.message).not.toContain(secret);
  });

  test("the extreme argument values are allowed", () => {
    const options = measured();
    expect(valueOf("{{ 'ab' | textWidth('mono', 1000, 100) }}", {}, options)).toBe(1200);
    expect(valueOf("{{ 'ab' | textWidth('mono', 0.01, -100) }}", {}, options)).toBeCloseTo(-199.99);
  });

  test("a text over 10000 UTF-16 units is too-large before it is measured", () => {
    const calls: string[] = [];
    for (const expression of [
      "{{ s | textWidth('mono', 10) }}",
      "{{ s | truncateWidth(9, 'mono', 10) }}",
    ]) {
      expect(errorOf(expression, { s: "a".repeat(10_001) }, measured(calls)).code).toBe(
        "too-large",
      );
    }
    expect(calls).toEqual([]);
    expect(valueOf("{{ s | textWidth('mono', 2) }}", { s: "a".repeat(10_000) }, measured())).toBe(
      10_000,
    );
  });

  test("every measurement is charged to the budget, by the length of the text", () => {
    const steps = (expression: string, data: Record<string, unknown>) => {
      const budget = createBudget();
      valueOf(expression, data, { ...measured(), budget });
      return budget.used;
    };
    const short = steps("{{ s | textWidth('mono', 10) }}", { s: "a" });
    const long = steps("{{ s | textWidth('mono', 10) }}", { s: "a".repeat(1600) });
    expect(long - short).toBe(100);
    const cut = steps("{{ s | truncateWidth(9, 'mono', 10) }}", { s: "a".repeat(1600) });
    // 101 steps per layout: the whole text, the ellipsis and one per bit of its length (11); the width argument
    // node makes up for the single step of the short text.
    expect(cut - short).toBe(101 * 13);
  });

  test("a spent budget stops the measuring before the measurer runs", () => {
    const calls: string[] = [];
    const budget = createBudget(50);
    const error = errorOf(
      "{{ s | textWidth('mono', 10) }}",
      { s: "a".repeat(5000) },
      {
        ...measured(calls),
        budget,
      },
    );
    expect(error.code).toBe("budget");
    expect(calls).toEqual([]);
  });
});
