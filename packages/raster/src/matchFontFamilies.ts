import { fontFamilies, quoteCssFamily } from "./cssText.js";
import { RasterError } from "./RasterError.js";
import type { RasterFont } from "./RasterFont.js";
import { escapeXmlAttribute, unescapeXml } from "./xmlText.js";

const textStart = /<text\b[^>]*>/g;
const familyAttribute = /\sfont-family="([^"]*)"/;
const weightAttribute = /\sfont-weight="([^"]*)"/;
const styleAttribute = /\sfont-style="([^"]*)"/;

/**
 * The SVG with each text's `font-family` set to the family inside the font that draws it, since resvg matches the
 * name inside the font while the renderer writes the asset's `family` (they may differ: `font-family-mismatch`).
 * The `@font-face` rule with the text's family, weight and style decides; a family no rule declares must be the name
 * inside one of the fonts. A text whose family no font carries is a `raster-font` error, never blank text. Only the
 * rasterizer's copy changes.
 */
export function matchFontFamilies(svg: string, fonts: readonly RasterFont[]): string {
  return svg.replace(textStart, (start) => {
    const value = familyAttribute.exec(start)?.[1];
    if (value === undefined) {
      throw new RasterError("raster-font", "a text names no font family, so no font can draw it");
    }
    const weight = Number(unescapeXml(weightAttribute.exec(start)?.[1] ?? "400"));
    const style = unescapeXml(styleAttribute.exec(start)?.[1] ?? "normal");
    const families = fontFamilies(unescapeXml(value));
    for (const family of families) {
      const resolved = resolve(fonts, family, weight, style);
      if (resolved === undefined) continue;
      if (resolved === family && families.length === 1) return start;
      return start.replace(
        familyAttribute,
        ` font-family="${escapeXmlAttribute(quoteCssFamily(resolved))}"`,
      );
    }
    const asked = JSON.stringify((families[0] ?? "").slice(0, 64));
    throw new RasterError(
      "raster-font",
      `a text asks for the font family ${asked}, which no embedded or given font carries; check the font asset's family`,
    );
  });
}

function resolve(
  fonts: readonly RasterFont[],
  family: string,
  weight: number,
  style: string,
): string | undefined {
  const declared = fonts.filter((font) => font.face?.family === family && font.family !== "");
  const chosen =
    declared.find((font) => font.face?.weight === weight && font.face.style === style) ??
    declared.find((font) => font.face?.style === style) ??
    declared[0];
  if (chosen !== undefined) return chosen.family;
  return fonts.some((font) => font.family === family) ? family : undefined;
}
