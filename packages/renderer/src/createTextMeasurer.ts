import type { TextMeasurer } from "@readmint/expr";
import { ShapingBudget } from "@readmint/fonts";
import { selectFont } from "./loadFont.js";
import { ownEntry } from "./ownEntry.js";
import type { RenderContext } from "./RenderContext.js";
import { cutProbes, cutToWidth, ellipsis } from "./cutToWidth.js";
import { shapeLines } from "./shapeLines.js";
import { stripXmlInvalid } from "./stripXmlInvalid.js";
import { TextShaper } from "./TextShaper.js";

/**
 * Measures text for `textWidth` and `truncateWidth` exactly as a text layer of the font, size and letter spacing
 * without a `width` lays it out (`shapeLines`): the same fallbacks, dropped clusters taking no space, the widest
 * paragraph. Measuring records no glyph, so it embeds nothing and warns no `missing-glyph`; its shaping counts against
 * the render's bound like a drawn text's, failing at the expression being evaluated. Results are cached per render.
 */
export function createTextMeasurer(context: RenderContext): TextMeasurer {
  /** `units`: UTF-16 units of every text the shaper lays out; each gets what a drawn text gets (`resolveText`). */
  const shaper = (font: string, size: number, letterSpacing: number, units: number) => {
    if (ownEntry(context.design.assets?.fonts, font) === undefined) return undefined;
    const path = context.expressionPath;
    const primary = selectFont(context, font, undefined, path);
    const options = {
      referenced: font,
      primary,
      weight: undefined,
      fontSize: size,
      letterSpacing,
      path,
    };
    return new TextShaper(context, options, ShapingBudget.forText(2 * units));
  };
  const cached = <T extends number | string>(key: string, measure: () => T | undefined) => {
    const known = context.textWidths.get(key) as T | undefined;
    if (known !== undefined) return known;
    const value = measure();
    if (value !== undefined) context.textWidths.set(key, value);
    return value;
  };
  return {
    width(text, font, size, letterSpacing) {
      const key = JSON.stringify(["width", font, size, letterSpacing, text]);
      return cached(key, () => {
        const content = stripXmlInvalid(text);
        const shaping = shaper(font, size, letterSpacing, content.length);
        return shaping === undefined ? undefined : shapeLines(shaping, content, undefined).widest;
      });
    },
    truncate(text, width, font, size, letterSpacing) {
      const key = JSON.stringify(["truncate", font, size, letterSpacing, width, text]);
      return cached(key, () => {
        const content = stripXmlInvalid(text);
        const units = (content.length + ellipsis.length) * cutProbes(content.length);
        const shaping = shaper(font, size, letterSpacing, units);
        if (shaping === undefined) return undefined;
        const measure = (part: string) => shapeLines(shaping, part, undefined).widest;
        const cut = cutToWidth(shaping, content, width, measure, false);
        // A text that fits is returned as given (its XML-invalid characters are removed where it is drawn).
        return cut === content ? text : cut;
      });
    },
  };
}
