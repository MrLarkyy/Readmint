import { encodeWoff, subsetFont } from "@readmint/fonts";
import { encodeBase64 } from "./base64.js";
import { escapeCssString } from "./escapeCssString.js";
import { escapeCssToken } from "./escapeCssToken.js";
import { escapeText } from "./escapeXml.js";
import type { RenderContext } from "./RenderContext.js";
import { withFont } from "./withFont.js";

/**
 * Writes one `@font-face` per font that draws text as font, once every text is laid out: a WOFF subset of exactly
 * the characters drawn with it, in the order the fonts were first used. A font drawn as paths (restricted by
 * licence or fsType, or asked to) is never embedded.
 */
export function embedFonts(context: RenderContext): void {
  for (const use of context.fontUse.values()) {
    const loaded = use.font;
    if (use.embedded.size === 0 || loaded.drawAs !== "font") continue;
    // zlib rarely shrinks font outlines past a quarter: a subset larger than that could never fit what is left.
    const maxBytes = Math.min(context.writer.remaining * 4, context.subsetBytesLeft);
    const sfnt = withFont(context, loaded, () =>
      subsetFont(loaded.font, use.embedded, { budget: context.outlineBudget, maxBytes }),
    );
    context.subsetBytesLeft -= sfnt.length;
    const woff = withFont(context, loaded, () => encodeWoff(sfnt));
    const dataUri = `data:font/woff;base64,${encodeBase64(woff)}`;
    use.embeddedBytes = dataUri.length;
    context.writer.style(
      escapeText(
        `@font-face{font-family:"${escapeCssString(loaded.family)}";src:url(${dataUri});font-weight:${escapeCssToken(String(loaded.weight))};font-style:${escapeCssToken(loaded.style)}}`,
      ),
    );
  }
}
