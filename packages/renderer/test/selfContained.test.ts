import { describe, expect, test } from "vitest";
import { renderSvg } from "../src/index.js";
import { hostileFixtures, unvalidatedDesign } from "./hostileDesigns.js";
import { animationDesigns } from "./animationDesigns.js";
import { renderFixture } from "./renderFixture.js";
import animation from "./renderer-animation.golden.js";
import components from "./renderer-components.golden.js";
import fontFormats from "./renderer-fonts-formats.golden.js";
import fonts from "./renderer-fonts.golden.js";
import images from "./renderer-images.golden.js";
import layout from "./renderer-layout.golden.js";
import shapes from "./renderer-shapes.golden.js";
import text from "./renderer-text.golden.js";
import { svgSafetyProblems } from "./svgSafety.js";

const suites = [shapes, layout, text, images, components, animation, fonts, fontFormats];

describe("every golden fixture is self-contained", () => {
  for (const suite of suites) {
    test.each(suite.fixtures.map((fixture) => [fixture.name, fixture.input] as const))(
      `${suite.name}: %s`,
      (_name, input) => {
        expect(svgSafetyProblems(renderFixture(input))).toEqual([]);
      },
    );
  }
});

test.each(animationDesigns.map(({ name, input }) => [name, input] as const))(
  "the animated SVG of %s is self-contained",
  (_name, input) => {
    expect(svgSafetyProblems(renderFixture(input))).toEqual([]);
  },
);

describe("hostile designs stay inert", () => {
  test.each(hostileFixtures.map((fixture) => [fixture.name, fixture.input] as const))(
    "%s",
    (_name, input) => {
      expect(svgSafetyProblems(renderFixture(input))).toEqual([]);
    },
  );

  test("path data from an unvalidated design cannot add attributes", () => {
    const result = renderSvg(unvalidatedDesign);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(svgSafetyProblems(result.svg)).toEqual([]);
    expect(result.svg).toContain('d="M0 0&quot; onload=&quot;alert(6)"');
  });

  test("font weight and style from an unvalidated design stay one attribute and one declaration each", () => {
    const fixture = hostileFixtures.find(
      ({ name }) => name === "unvalidated font weight and style",
    );
    if (fixture === undefined) throw new Error("fixture");
    const svg = renderFixture(fixture.input);
    expect(svgSafetyProblems(svg)).toEqual([]);
    expect(svg).toContain('font-weight="400&quot; onload=&quot;alert(7)"');
    expect(svg.split("</style>")).toHaveLength(2);
    const style = svg.slice(svg.indexOf("<style>"), svg.indexOf("</style>"));
    expect(style.match(/[{}]/gu)).toEqual(["{", "}"]);
    expect(style).not.toMatch(/@import|&lt;|&gt;/u);
    expect(style).toContain(
      ";font-weight:400\\22 \\20 onload\\3d \\22 alert\\28 7\\29 ;font-style:normal\\7d \\3c \\2f style\\3e ",
    );
  });
});

describe("the safety check itself", () => {
  test.each([
    ["<svg><script>x</script></svg>", "<script> element"],
    ["<svg><foreignObject/></svg>", "<foreignobject> element"],
    ['<svg><rect onclick="x"/></svg>', "event attribute onclick"],
    ['<svg><image href="https://x.example/a.png"/></svg>', "href=https://x.example/a.png"],
    [
      '<svg><image href="data:image/svg+xml;base64,AAAA"/></svg>',
      "href=data:image/svg+xml;base64,AAAA",
    ],
    ['<svg><rect fill="url(https://x.example/#a)"/></svg>', "url() in fill"],
    ["<svg><style>@import url(x.css);</style></svg>", "@import in a style"],
    [
      "<svg><style>a{src:url(https://x.example/f.ttf)}</style></svg>",
      "style url(https://x.example/f.ttf)",
    ],
    ['<svg><a href="javascript:alert(1)"/></svg>', "href=javascript:alert(1)"],
    ['<svg><use href="#s1"/></svg>', "href names no id: #s1"],
    ['<svg><rect id="g1"/><rect fill="url(#g2)"/></svg>', "url() in fill names no id: #g2"],
    ['<svg><use href="#a b"/></svg>', "href=#a b"],
  ])("flags %s", (svg, problem) => {
    expect(svgSafetyProblems(svg)).toContain(problem);
  });
});
