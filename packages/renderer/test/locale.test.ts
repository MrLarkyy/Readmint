import { designLocales, type Design } from "@readmint/format";
import { supportedLocales } from "@readmint/expr";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { fontAssets } from "./testAssets.js";

const data = { n: 1234567.5, r: 0.25 };

function textDesign(content: string, extra: Partial<Design> = {}): Design {
  return {
    version: 0,
    canvas: { width: 300, height: 40 },
    assets: { fonts: { f: fontAssets.medium } },
    layers: [{ type: "text", content, font: "f" }],
    ...extra,
  };
}

/** The text the render wrote, read back from the `<text>` element. */
function rendered(design: Design, options: RenderOptions = {}): string {
  const result = renderSvg(design, { data, ...options });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

const both = "{{ n | number(1) }} {{ r | percent }}";
const en = "1,234,567.5 25%";
const cs = "1 234 567,5 25 %";

describe("design locale", () => {
  test("without a locale the text is formatted for en", () => {
    expect(rendered(textDesign(both))).toContain(en);
  });

  test("a design locale formats every expression", () => {
    const svg = rendered(textDesign(both, { locale: "cs" }));
    expect(svg).toContain(cs);
    expect(svg).not.toContain(en);
  });

  test("the render option beats the design locale", () => {
    expect(rendered(textDesign(both, { locale: "cs" }), { locale: "en" })).toContain(en);
  });

  test("a filter argument beats both", () => {
    const design = textDesign("{{ n | number(1, 'de') }}", { locale: "cs" });
    expect(rendered(design, { locale: "en" })).toContain("1.234.567,5");
    expect(rendered(design)).toContain("1.234.567,5");
  });

  test("an unvalidated non-string locale renders with en", () => {
    const design = { ...textDesign(both), locale: 5 } as unknown as Design;
    expect(rendered(design)).toContain(en);
  });

  test("format and expr list the same locales", () => {
    expect([...designLocales]).toEqual([...supportedLocales]);
  });
});
