import { describe, expect, test } from "vitest";
import { ExpressionLimits } from "../src/index.js";
import { quoteSource } from "../src/quoteSource.js";
import { errorOf } from "./evaluateText.js";

const secret = "ghp_FAKE0123456789abcdefSECRET";
const data = {
  token: secret,
  user: { [secret]: 1, login: secret },
  list: [secret, { x: secret }],
  number: 12,
};

describe("errors point to the expression and the position", () => {
  test("a parse error carries code, span, excerpt and a 1-based column", () => {
    expect(errorOf("Hi {{ user. }}!")).toEqual({
      code: "syntax",
      message: "expected a property name after . at column 13",
      start: 12,
      end: 14,
      excerpt: "{{ user. }}",
    });
  });

  test("an evaluation error uses the node's span", () => {
    expect(errorOf("a {{ number + 'x' }} b", data)).toEqual({
      code: "type",
      message: "+ needs two numbers or two strings, got number and string at column 13",
      start: 12,
      end: 17,
      excerpt: "{{ number + 'x' }}",
    });
  });

  test("a filter error uses the filter call's span", () => {
    expect(errorOf("{{ number | truncate(-1) }}", data)).toMatchObject({
      code: "type",
      start: 12,
      end: 24,
    });
  });

  test("the excerpt is the placeholder only, clipped around the error to maxEcho", () => {
    const text = `${"lead ".repeat(30)}{{ ${"a + ".repeat(40)}nope }}${" tail".repeat(30)}`;
    const error = errorOf(text, { a: 1 });
    expect(error.code).toBe("unknown-name");
    expect(error.excerpt.length).toBeLessThanOrEqual(ExpressionLimits.maxEcho);
    expect(error.excerpt).toContain("nope");
    expect(error.excerpt.startsWith("…")).toBe(true);
    expect(error.excerpt).not.toContain("lead");
    expect(error.excerpt).not.toContain("tail");
  });

  test.each([
    "{{ token + 1 }}",
    "{{ token | number }}",
    "{{ token | date }}",
    "{{ number | number(0, token) }}",
    "{{ number | date('yyyy', token) }}",
    "{{ number | date(token) }}",
    "{{ token | padStart(token) }}",
    "{{ token | truncate(token) }}",
    "{{ list[0] * 2 }}",
    "{{ list[1] }} text",
    "{{ list | join }}",
    "{{ user.login < 1 }}",
    "{{ user[token] + 'a' + user }}",
    "{{ -token }}",
    "{{ list == list }}",
    "{{ token | clamp(token, 1) }}",
  ])("no data value reaches the message or the excerpt: %s", (text) => {
    const error = errorOf(text, data);
    expect(error.message).not.toContain("ghp_");
    expect(error.excerpt).not.toContain("ghp_");
    expect(JSON.stringify(error)).not.toContain("SECRET");
  });

  test("control and Bidi characters of the source are escaped in the excerpt", () => {
    const bidi = [
      0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068,
      0x2069,
    ];
    for (const unit of [0x00, 0x07, 0x1b, 0x7f, 0x85, 0x9f, 0x2028, 0x2029, ...bidi]) {
      const char = String.fromCharCode(unit);
      const error = errorOf(`{{ "${char}" + 1 }}`);
      expect(error.excerpt).not.toContain(char);
      expect(error.excerpt).toContain(`\\u{${unit.toString(16)}}`);
    }
  });

  test("newlines and tabs in the source are escaped too", () => {
    expect(errorOf("{{ a\n+\t1 }}").excerpt).toBe("{{ a\\u{a}+\\u{9}1 }}");
  });

  test("an excerpt never splits a surrogate pair and escapes a lone surrogate", () => {
    const emoji = "\u{1F600}";
    const source = `{{ ${emoji.repeat(40)} }}`;
    const excerpt = quoteSource(source, { start: 0, end: source.length }, 40);
    expect(excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    expect(quoteSource("{{ \uD800 }}", { start: 0, end: 8 }, 3)).toBe("{{ \\u{d800} }}");
  });

  test("a hostile name is clipped in the message", () => {
    const name = "n".repeat(5000);
    const error = errorOf(`{{ ${name} }}`);
    expect(error.code).toBe("unknown-name");
    expect(error.message.length).toBeLessThan(80);
  });
});
