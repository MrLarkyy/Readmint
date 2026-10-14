import { describe, expect, test } from "vitest";
import { wrapText } from "../src/wrapText.js";

/** Every code point is 1 wide, so widths are character counts. */
const count = (text: string) => Array.from(text).length;

describe("wrapText", () => {
  test("greedy wrapping at spaces drops the space at a soft break", () => {
    expect(wrapText("aa bb cc dd", 5, count)).toEqual(["aa bb", "cc dd"]);
    expect(wrapText("aa bb cc", 4, count)).toEqual(["aa", "bb", "cc"]);
  });

  test("a word wider than the line breaks between code points", () => {
    expect(wrapText("x abcdefgh y", 3, count)).toEqual(["x", "abc", "def", "gh", "y"]);
  });

  test("line breaks are hard breaks, with or without a width", () => {
    expect(wrapText("one\ntwo\r\nthree\rfour", undefined, count)).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
    expect(wrapText("a b\nc", 10, count)).toEqual(["a b", "c"]);
  });

  test("astral code points are measured once and never split", () => {
    const measured: string[] = [];
    const lines = wrapText("😀😀😀😀", 2, (text) => {
      measured.push(text);
      return count(text);
    });
    expect(lines).toEqual(["😀😀", "😀😀"]);
    expect(measured).toContain("😀");
    expect(measured.every((text) => !/^[\uD800-\uDFFF]$/u.test(text))).toBe(true);
  });

  test("extra spaces are kept, empty content gives one empty line", () => {
    expect(wrapText("a  b", 10, count)).toEqual(["a  b"]);
    expect(wrapText("", 10, count)).toEqual([""]);
    expect(wrapText("", undefined, count)).toEqual([""]);
  });

  test("a long text wraps in linear time", () => {
    const text = "word ".repeat(2000);
    const started = performance.now();
    expect(wrapText(text, 50, count).length).toBeGreaterThan(100);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
