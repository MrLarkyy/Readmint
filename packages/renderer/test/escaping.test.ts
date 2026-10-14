import type { Design } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { escapeCssString } from "../src/escapeCssString.js";
import { escapeAttribute, escapeText } from "../src/escapeXml.js";
import { stripXmlInvalid } from "../src/stripXmlInvalid.js";
import { hostileFixtures } from "./hostileDesigns.js";
import { renderFixture } from "./renderFixture.js";
import { fontAssets } from "./testAssets.js";

function fixture(name: string) {
  const found = hostileFixtures.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(name);
  return found.input;
}

/** Code points outside the XML 1.0 `Char` production, found without the production regex. */
function xmlInvalidCodePoints(text: string): number[] {
  const found: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const valid =
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff);
    if (!valid) found.push(code);
  }
  return found;
}

describe("escape functions", () => {
  test("XML specials", () => {
    expect(escapeText(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
    expect(escapeAttribute(`" onload="x`)).toBe("&quot; onload=&quot;x");
    expect(escapeText("plain text 123")).toBe("plain text 123");
  });

  test.each([
    ["NUL", "\u0000"],
    ["U+0001", "\u0001"],
    ["backspace", "\u0008"],
    ["vertical tab", "\u000B"],
    ["form feed", "\u000C"],
    ["escape", "\u001B"],
    ["U+FFFE", "\uFFFE"],
    ["U+FFFF", "\uFFFF"],
    ["a lone high surrogate", "\uD800"],
    ["a lone low surrogate", "\uDC00"],
    ["a reversed surrogate pair", "\uDC00\uD800"],
  ])("%s is removed", (_name, char) => {
    expect(stripXmlInvalid(`a${char}b`)).toBe("ab");
    expect(escapeText(`<${char}>`)).toBe("&lt;&gt;");
    expect(escapeAttribute(`"${char}"`)).toBe("&quot;&quot;");
  });

  test.each([
    ["tab", "\t"],
    ["line feed", "\n"],
    ["carriage return", "\r"],
    ["U+0085", "\u0085"],
    ["U+D7FF", "\uD7FF"],
    ["U+E000", "\uE000"],
    ["U+FFFD", "\uFFFD"],
    ["an emoji", "😀"],
    ["U+10FFFF", "\u{10FFFF}"],
  ])("%s is kept", (_name, char) => {
    expect(stripXmlInvalid(`a${char}b`)).toBe(`a${char}b`);
    expect(escapeText(char)).toBe(char);
    expect(escapeAttribute(char)).toBe(char);
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

  test("no rendered SVG holds a code point XML does not allow", () => {
    for (const { name, input } of hostileFixtures) {
      expect(xmlInvalidCodePoints(renderFixture(input)), name).toEqual([]);
    }
  });

  test("XML-invalid characters are removed from every string they reach", () => {
    const svg = renderFixture(fixture("XML-invalid characters"));
    expect(svg).toContain("<title>txyz</title><desc>dxyz</desc>");
    expect(svg).toContain(">bioxyzend</tspan>");
    expect(svg).toContain('aria-label="axyz"');
    expect(svg).toContain("font-family:&quot;Montserrat\\c xyz&quot;");
    expect(svg).toContain('font-family="&#39;Montserrat\\c xyz&#39;"');
    expect(svg).toContain('d="M0 0L10 10"');
  });

  test.each([
    ["literal", "a\u0000b\u001B😀", {}],
    ["from data", "{{ s }}", { s: "a\u0000b\u001B😀" }],
  ])(
    "a %s text with XML-invalid characters renders as the text without them",
    (_name, content, data) => {
      // `end` alignment writes the measured width into the output, so a different measurement shows.
      const design = (text: string): Design => ({
        version: 0,
        canvas: { width: 100, height: 40 },
        assets: { fonts: { f: fontAssets.medium } },
        layers: [{ type: "text", content: text, font: "f", align: "end" }],
      });
      expect(renderFixture({ design: design(content), data })).toBe(
        renderFixture({ design: design("ab😀") }),
      );
    },
  );

  test("path data whitespace SVG does not know is written as a space, with the same box", () => {
    // In a row stack the rect sits right of the path's box, so a different box shows.
    const design = (d: string): Design => ({
      version: 0,
      canvas: { width: 100, height: 100 },
      layers: [
        {
          type: "group",
          layout: { type: "stack", direction: "row" },
          children: [
            { type: "path", d, stroke: "#000" },
            { type: "rect", width: 1, height: 1 },
          ],
        },
      ],
    });
    const odd = renderFixture({ design: design("M0\u000B0L10\u000C10\u00A0L20\u20280") });
    expect(odd).toContain('d="M0 0L10 10 L20 0"');
    expect(odd).toBe(renderFixture({ design: design("M0 0L10 10 L20 0") }));
  });
});
