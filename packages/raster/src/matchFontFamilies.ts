import { fontFamilies, quoteCssFamily } from "./cssText.js";
import { RasterError } from "./RasterError.js";
import type { RasterFont } from "./RasterFont.js";
import { escapeXmlAttribute, unescapeXml } from "./xmlText.js";

const textTag = /<(\/?)(text|tspan)\b([^>]*?)(\/?)>/g;
const familyAttribute = /\sfont-family="([^"]*)"/;
const weightAttribute = /\sfont-weight="([^"]*)"/;
const styleAttribute = /\sfont-style="([^"]*)"/;
const stretchAttribute = /\sfont-stretch="[^"]*"/;

/** The font a text or tspan asks for, as its own attributes and its parent's give it. */
interface Asked {
  readonly families: readonly string[];
  readonly weight: number;
  readonly style: string;
  /** The tag sets resvg's `font-stretch`, `font-weight` and `font-style` to one face, which its children inherit. */
  readonly pinned: boolean;
}

/**
 * The SVG with each text and tspan that asks for a font drawing with the face a browser takes for it. resvg matches
 * the name inside the font, while the renderer writes the asset's `family` (they may differ:
 * `font-family-mismatch`), and it picks among the faces of one name by width before weight, by the weight inside the
 * font rather than the rule's: two faces of one family at different widths, or a face whose own weight is not the
 * rule's, would draw with the wrong face. So the `@font-face` rule with the asked family, style and weight (as CSS
 * matches them) decides, and the tag names that face by the family, `font-stretch`, weight and style inside it. A
 * family no rule declares must be the name inside one of the fonts, and resvg matches it. A text whose family no
 * font carries is a `raster-font` error, never blank text. Only the rasterizer's copy changes.
 */
export function matchFontFamilies(svg: string, fonts: readonly RasterFont[]): string {
  const open: (Asked | undefined)[] = [];
  return svg.replace(
    textTag,
    (tag, closing: string, name: string, attributes: string, selfClosing: string) => {
      if (closing !== "") {
        open.pop();
        return tag;
      }
      const parent = open.at(-1);
      const value = familyAttribute.exec(attributes)?.[1];
      if (value === undefined && name === "text") {
        throw new RasterError("raster-font", "a text names no font family, so no font can draw it");
      }
      const ownWeight = weightAttribute.exec(attributes)?.[1];
      const ownStyle = styleAttribute.exec(attributes)?.[1];
      let result = { tag, asked: parent };
      // A tspan that asks nothing of its own inherits its parent's face (or nothing, outside a text).
      if (
        value !== undefined ||
        ((ownWeight !== undefined || ownStyle !== undefined) && parent !== undefined)
      ) {
        const asked: Asked = {
          families:
            value === undefined ? (parent?.families ?? []) : fontFamilies(unescapeXml(value)),
          weight: weightOf(ownWeight, parent?.weight ?? 400),
          style: ownStyle === undefined ? (parent?.style ?? "normal") : unescapeXml(ownStyle),
          pinned: false,
        };
        result = matchTag(tag, asked, parent, fonts);
      }
      if (selfClosing === "") open.push(result.asked);
      return result.tag;
    },
  );
}

function matchTag(
  tag: string,
  asked: Asked,
  parent: Asked | undefined,
  fonts: readonly RasterFont[],
): { tag: string; asked: Asked } {
  for (const family of asked.families) {
    const face = declaredFace(fonts, family, asked.weight, asked.style);
    if (face !== undefined) {
      const { weight, stretch, style } = face.drawn;
      return {
        tag: withAttributes(tag, face.family, String(weight), stretch, style),
        asked: { ...asked, pinned: true },
      };
    }
    if (!fonts.some((font) => font.family === family)) continue;
    if (parent?.pinned === true) {
      // Undo what the pinned parent hands down, so resvg matches this family as asked.
      return {
        tag: withAttributes(tag, family, String(asked.weight), "normal", asked.style),
        asked,
      };
    }
    if (asked.families.length === 1) return { tag, asked };
    return { tag: withAttributes(tag, family), asked };
  }
  const shown = JSON.stringify((asked.families[0] ?? "").slice(0, 64));
  throw new RasterError(
    "raster-font",
    `a text asks for the font family ${shown}, which no embedded or given font carries; check the font asset's family`,
  );
}

function weightOf(value: string | undefined, inherited: number): number {
  if (value === undefined) return inherited;
  const text = unescapeXml(value).trim();
  if (text === "normal") return 400;
  if (text === "bold") return 700;
  const weight = Number(text);
  return text !== "" && Number.isFinite(weight) ? weight : inherited;
}

function withAttributes(
  tag: string,
  family: string,
  weight?: string,
  stretch?: string,
  style?: string,
): string {
  let rewritten = setAttribute(tag, familyAttribute, "font-family", quoteCssFamily(family));
  if (weight !== undefined)
    rewritten = setAttribute(rewritten, weightAttribute, "font-weight", weight);
  if (stretch !== undefined)
    rewritten = setAttribute(rewritten, stretchAttribute, "font-stretch", stretch);
  if (style !== undefined) rewritten = setAttribute(rewritten, styleAttribute, "font-style", style);
  return rewritten;
}

function setAttribute(tag: string, pattern: RegExp, name: string, value: string): string {
  const attribute = ` ${name}="${escapeXmlAttribute(value)}"`;
  if (pattern.test(tag)) return tag.replace(pattern, attribute);
  const end = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
  return `${tag.slice(0, end)}${attribute}${tag.slice(end)}`;
}

/** The face of the `@font-face` rules declaring `family` a browser draws with: style first, then weight, as CSS. */
function declaredFace(
  fonts: readonly RasterFont[],
  family: string,
  weight: number,
  style: string,
): RasterFont | undefined {
  const declared = fonts.filter((font) => font.face?.family === family && font.family !== "");
  const styles =
    style === "italic"
      ? ["italic", "oblique", "normal"]
      : style === "oblique"
        ? ["oblique", "italic", "normal"]
        : ["normal", "oblique", "italic"];
  for (const wanted of styles) {
    const faces = declared.filter((font) => font.face?.style === wanted);
    if (faces.length > 0) return nearestWeight(faces, weight);
  }
  return undefined;
}

/** The CSS font matching order for weight: below 400 lighter first, above 500 heavier first, else up to 500 first. */
function nearestWeight(faces: readonly RasterFont[], weight: number): RasterFont | undefined {
  const of = (font: RasterFont): number => font.face?.weight ?? 400;
  const exact = faces.find((font) => of(font) === weight);
  if (exact !== undefined) return exact;
  const lighter = faces.filter((font) => of(font) < weight).sort((a, b) => of(b) - of(a));
  const heavier = faces.filter((font) => of(font) > weight).sort((a, b) => of(a) - of(b));
  if (weight < 400) return lighter[0] ?? heavier[0];
  if (weight > 500) return heavier[0] ?? lighter[0];
  return heavier.find((font) => of(font) <= 500) ?? lighter[0] ?? heavier[0];
}
