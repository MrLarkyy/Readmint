import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { wrapParagraphs, wrapText } from "../src/wrapText.js";

/** Every code point is 1 wide, so widths are character counts. */
const count = (text: string) => Array.from(text).length;

describe("wrapText space variants", () => {
  test.each(["\u2009", "\u3000", "\u2003", "\u205f"])(
    "space variant %# breaks and is dropped at a soft break",
    (space) => {
      expect(wrapText(`aa${space}bb${space}cc`, 5, count)).toEqual(["aa" + space + "bb", "cc"]);
      expect(wrapText(`aa${space}bb`, 3, count)).toEqual(["aa", "bb"]);
    },
  );

  test("the separator is measured with its own width", () => {
    const wide = (text: string) =>
      Array.from(text).reduce((sum, c) => sum + (c === "\u3000" ? 3 : 1), 0);
    expect(wrapText("a\u3000b", 4, wide)).toEqual(["a", "b"]);
    expect(wrapText("a\u3000b", 5, wide)).toEqual(["a\u3000b"]);
    expect(wrapText("a b", 3, wide)).toEqual(["a b"]);
  });

  test.each(["\u00a0", "\u2007", "\u202f"])("no-break variant %# never breaks", (space) => {
    expect(wrapText(`aa${space}bb`, 3, count)).toEqual(["aa" + space, "bb"]);
    expect(wrapText(`aa${space}bb cc`, 5, count)).toEqual([`aa${space}bb`, "cc"]);
  });
});

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
    const lines = wrapText("\u{1f600}\u{1f600}\u{1f600}\u{1f600}", 2, (text) => {
      measured.push(text);
      return count(text);
    });
    expect(lines).toEqual(["\u{1f600}\u{1f600}", "\u{1f600}\u{1f600}"]);
    expect(measured).toContain("\u{1f600}");
    expect(measured.every((text) => !/^[\uD800-\uDFFF]$/u.test(text))).toBe(true);
  });

  test("extra spaces are kept, empty content gives one empty line", () => {
    expect(wrapText("a  b", 10, count)).toEqual(["a  b"]);
    expect(wrapText("", 10, count)).toEqual([""]);
    expect(wrapText("", undefined, count)).toEqual([""]);
  });

  test("a word wider than the line breaks only between the pieces it is split into", () => {
    const pieces = (word: string) => word.match(/../gu) ?? [word];
    expect(wrapText("abcdefgh", 3, count, pieces)).toEqual(["ab", "cd", "ef", "gh"]);
  });

  test("lines are ranges of their paragraph, so bidi levels of the whole paragraph apply", () => {
    expect(wrapParagraphs("aa bb cc\ndd", 5, count)).toEqual([
      {
        text: "aa bb cc",
        lines: [
          { start: 0, end: 5 },
          { start: 6, end: 8 },
        ],
      },
      { text: "dd", lines: [{ start: 0, end: 2 }] },
    ]);
  });

  test("a long text wraps in linear time", () => {
    const text = "word ".repeat(2000);
    const started = performance.now();
    expect(wrapText(text, 50, count).length).toBeGreaterThan(100);
    expect(performance.now() - started).toBeLessThan(500 * loadScale());
  });
});
