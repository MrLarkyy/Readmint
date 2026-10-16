import { describe, expect, test } from "vitest";
import { htmlToText } from "../src/htmlToText.js";
import { plainText } from "../src/plainText.js";

describe("htmlToText", () => {
  test.each([
    ["<p>a</p><p>b</p>", " a  b "],
    ["a<b>b</b>c", "abc"],
    ["a<br/>b<br>c", "a b c"],
    ['<a href="x" title="a>b">link</a>', "link"],
    ["x<script>alert('<p>')</script>y", "xy"],
    ["x<SCRIPT type='t'>a</script >y", "xy"],
    ["x<style>p{}</style>y<script/>z", "xyz"],
    ["x<!-- <p>hidden</p> -->y", "xy"],
    ["a < b and c<1", "a < b and c<1"],
    ["Tom &amp; Jerry &mdash; &#65;&#x42; &hellip;", "Tom & Jerry — AB …"],
    ["&unknown; &#0; &#xD800; &#x110000; & alone", "&unknown; &#0; &#xD800; &#x110000; & alone"],
    ["&constructor; &__proto__;", "&constructor; &__proto__;"],
    ["<p unclosed", " "],
    ["x<script>never closed", "x"],
  ])("%j reads %j", (html, text) => {
    expect(htmlToText(html)).toBe(text);
  });

  test("a large fragment is read in one pass", () => {
    const html = "<p>a &amp; <b>b</b></p>".repeat(200_000);
    const started = performance.now();
    expect(htmlToText(html)).toHaveLength(" a & b ".length * 200_000);
    expect(performance.now() - started).toBeLessThan(5000);
  });

  test("many unclosed scripts stay linear", () => {
    const started = performance.now();
    htmlToText("<script>".repeat(100_000));
    expect(performance.now() - started).toBeLessThan(5000);
  });
});

describe("plainText", () => {
  test("collapses whitespace, removes control characters, trims", () => {
    expect(plainText("  a\t\n b\u0000c\u0085  d​ ", 100)).toBe("a bc d​");
  });

  test("keeps a text of exactly the cap", () => {
    expect(plainText("abcde", 5)).toBe("abcde");
  });

  test("cuts a longer text to cap - 1 code points and an ellipsis", () => {
    expect(plainText("abcdef", 5)).toBe("abcd…");
    expect(plainText("abc def", 5)).toBe("abc…");
  });

  test("never splits a surrogate pair", () => {
    const emoji = "\u{1f600}";
    expect(plainText(emoji.repeat(5), 5)).toBe(emoji.repeat(5));
    expect(plainText(emoji.repeat(6), 5)).toBe(`${emoji.repeat(4)}…`);
  });
});
