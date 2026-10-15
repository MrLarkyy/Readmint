import { describe, expect, test } from "vitest";
import { normalizeSvg } from "../src/node/normalizeSvg.js";

describe("normalizeSvg", () => {
  test("renames ids by definition order and rewrites every kind of reference", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-labelledby="t d">' +
      '<title id="t">T</title><desc id="d">D</desc>' +
      '<defs><linearGradient id="zeta"/><symbol id="alpha"/></defs>' +
      '<rect fill="url(#zeta)" style="stroke:url(\'#zeta\')"/><use href="#alpha"/><use xlink:href="#alpha"/>' +
      '<animate id="anim" begin="0s;anim.end+0.5s" end="alpha.click"/>' +
      "<style>#alpha { fill: #abc; } rect { filter: url(#zeta) }</style></svg>";
    const out = normalizeSvg(svg);
    expect(out).toContain('<title id="id0">');
    expect(out).toContain('<desc id="id1">');
    expect(out).toContain('aria-labelledby="id0 id1"');
    expect(out).toContain('<linearGradient id="id2"/><symbol id="id3"/>');
    expect(out).toContain('fill="url(#id2)"');
    expect(out).toContain("stroke:url('#id2')");
    expect(out).toContain('<use href="#id3"/><use xlink:href="#id3"/>');
    expect(out).toContain('begin="0s;id4.end+0.5s" end="id3.click"');
    expect(out).toContain("#id3 { fill: #abc; } rect { filter: url(#id2) }");
  });

  test("two renders that differ only in ids normalize equal", () => {
    const make = (id: string) =>
      `<svg><linearGradient id="${id}"/><rect fill="url(#${id})"/></svg>`;
    expect(normalizeSvg(make("a-1f3"))).toBe(normalizeSvg(make("b-99")));
  });

  test("leaves unknown references and hex colours alone", () => {
    const out = normalizeSvg('<svg><rect id="fff" fill="#fff"/><use href="#missing"/></svg>');
    expect(out).toContain('id="id0" fill="#fff"');
    expect(out).toContain('href="#missing"');
  });

  test("rounds numbers, strips zeros, fixes negative zero and exponents", () => {
    const out = normalizeSvg(
      '<svg><path d="M1.23456 -0.0001L10.500 2e-7 1e2-3.0004"/><rect x="-0" opacity="0.50"/></svg>',
    );
    expect(out).toContain('d="M1.235 0L10.5 0 100-3"');
    expect(out).toContain('x="0" opacity="0.5"');
  });

  test("honours the requested precision", () => {
    expect(normalizeSvg('<svg><rect x="1.23456"/></svg>', 1)).toContain('x="1.2"');
  });

  test("does not touch namespaces, class, font-family or text nodes", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text class="a1.50" font-family="Font 3.50">1.23456 text</text></svg>';
    const out = normalizeSvg(svg);
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('class="a1.50" font-family="Font 3.50">1.23456 text</text>');
  });

  test("replaces data URIs with a digest of their content", () => {
    const a = normalizeSvg(
      '<svg><image href="data:image/png;base64,AAAA"/><rect style="fill:url(data:x/y;z,1.2345)"/></svg>',
    );
    const b = normalizeSvg('<svg><image href="data:image/png;base64,BBBB"/></svg>');
    expect(a).toMatch(/href="data:image\/png;sha256=[0-9a-f]{64}"/);
    expect(a).not.toContain("AAAA");
    expect(a).toContain("data:x/y;sha256=");
    expect(a.match(/sha256=[0-9a-f]{64}/)?.[0]).not.toBe(b.match(/sha256=[0-9a-f]{64}/)?.[0]);
  });

  test("replaces data URIs inside a style element (embedded fonts)", () => {
    const svg = (payload: string) =>
      `<svg><style>@font-face{font-family:&quot;F&quot;;src:url(data:font/ttf;base64,${payload});font-weight:500}</style></svg>`;
    const a = normalizeSvg(svg("AAEAAA+/=="));
    expect(a).toMatch(/src:url\(data:font\/ttf;sha256=[0-9a-f]{64}\);font-weight:500/);
    expect(a).not.toContain("AAEAAA");
    expect(normalizeSvg(a)).toBe(a);
    expect(normalizeSvg(svg("BBEAAA+/=="))).not.toBe(a);
  });

  test("ignores comments and CDATA when looking for tags", () => {
    const svg =
      '<svg><!-- <rect id="x" x="1.23456"/> --><style><![CDATA[ a > b { x: 1.23456 } ]]></style><rect id="y"/></svg>';
    const out = normalizeSvg(svg);
    expect(out).toContain('<!-- <rect id="x" x="1.23456"/> -->');
    expect(out).toContain('<rect id="id0"/>');
  });

  test("converts CRLF and ends with exactly one newline", () => {
    expect(normalizeSvg("<svg>\r\n<g/>\r\n</svg>\r\n\r\n")).toBe("<svg>\n<g/>\n</svg>\n");
  });

  test("is idempotent", () => {
    const svg =
      '<svg><defs><g id="q9"/></defs><use href="#q9" x="1.23456"/><image href="data:image/png;base64,AAAA"/>' +
      '<animate begin="q9.end" fill="url(#q9)"/></svg>';
    const once = normalizeSvg(svg);
    expect(normalizeSvg(once)).toBe(once);
  });

  test("is stable when ids swap names", () => {
    const once = normalizeSvg('<svg><g id="id1"/><g id="id0"/><use href="#id1"/></svg>');
    expect(once).toBe('<svg><g id="id0"/><g id="id1"/><use href="#id0"/></svg>\n');
    expect(normalizeSvg(once)).toBe(once);
  });
});

test("an aria-label keeps its text exactly: numbers in it are words, not coordinates", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="1.23456" aria-label="Readmint 2.0 (v1.10)">x</text></svg>';
  const out = normalizeSvg(svg);
  expect(out).toContain('aria-label="Readmint 2.0 (v1.10)"');
  expect(out).toContain('x="1.235"');
});
