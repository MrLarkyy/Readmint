import { describe, expect, test } from "vitest";
import { escapeCssString } from "../src/escapeCssString.js";
import { escapeAttribute, escapeText } from "../src/escapeXml.js";
import { hostileFixtures } from "./hostileDesigns.js";
import { renderFixture } from "./renderFixture.js";

function fixture(name: string) {
  const found = hostileFixtures.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(name);
  return found.input;
}

describe("escape functions", () => {
  test("XML specials", () => {
    expect(escapeText(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
    expect(escapeAttribute(`" onload="x`)).toBe("&quot; onload=&quot;x");
    expect(escapeText("plain text 123")).toBe("plain text 123");
  });

  test("CSS strings cannot be ended or leave the style element", () => {
    const escaped = escapeCssString(`a"b'c\\d</style>\ne{}@import url(x)`);
    expect(escaped).not.toMatch(/["'<>\n()@]/u);
    expect(escaped).toBe("a\\22 b\\27 c\\5c d\\3c /style\\3e \\a e{}\\40 import url\\28 x\\29 ");
  });
});

describe("rendered strings", () => {
  test("text, title and description from data are escaped", () => {
    const svg = renderFixture(fixture("text from data"));
    expect(svg).toContain("<title>&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("<desc>&quot;/&gt;&lt;script&gt;");
    expect(svg).toContain("&lt;/text&gt;&lt;/svg&gt;&lt;svg");
    expect(svg).toContain("&amp;amp;&#39;");
    expect(svg.match(/<svg[\s>]/gu)).toHaveLength(1);
  });

  test("alt text is an escaped attribute", () => {
    const svg = renderFixture(fixture("image alt and webp"));
    expect(svg).toContain('aria-label="&quot;/&gt;&lt;script&gt;');
    expect(svg).toContain('aria-label="a &amp; b &lt; c"');
  });

  test("a font family stays one CSS string in one style element", () => {
    const svg = renderFixture(fixture("font family breaking out of css"));
    expect(svg.match(/<style>/gu)).toHaveLength(1);
    expect(svg.match(/<\/style>/gu)).toHaveLength(1);
    const style = /<style>([\s\S]*)<\/style>/u.exec(svg)?.[1] ?? "";
    expect(style.match(/@font-face/gu)).toHaveLength(1);
    expect(style).toContain(
      "font-family:&quot;M\\22 };}\\3c /style\\3e \\3c script\\3e alert\\28 5\\29 ",
    );
    expect(style).not.toMatch(/@import|url\((?!data:font\/ttf;base64,)/u);
    expect(svg).toContain('font-family="&#39;M\\22 };}\\3c /style\\3e ');
  });
});
