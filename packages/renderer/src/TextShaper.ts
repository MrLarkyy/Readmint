import { fontFallbacks, selectFont, type LoadedFont } from "./loadFont.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { fontFault } from "./withFont.js";

/** A code point with the font that draws it (undefined: no font has it) and its advance including spacing. */
interface Resolved {
  readonly font: LoadedFont | undefined;
  readonly glyph: number;
  readonly advance: number;
}

/** A glyph of a laid-out line; `font` undefined when no font covers the code point. */
export interface ShapedGlyph {
  readonly font: LoadedFont | undefined;
  readonly glyph: number;
  readonly codePoint: number;
  readonly x: number;
}

export interface TextShaperOptions {
  /** The asset the text names: its fallback list is used. */
  readonly referenced: string;
  /** The font chosen for the text (by weight among the referenced family). */
  readonly primary: LoadedFont;
  /** The weight the text asks for, matched in each fallback's family as well. */
  readonly weight: number | undefined;
  readonly fontSize: number;
  readonly letterSpacing: number;
}

/**
 * Places code points one by one: each takes the first of the primary font and its fallbacks that has a glyph for
 * it (none: the primary's .notdef advance, not drawn); a pair in the same font with kerning on is kerned; letter
 * spacing follows every code point. Sums run in code point order, so every engine adds the same numbers. No
 * shaping beyond that: no ligatures, no marks, no reordering.
 */
export class TextShaper {
  private readonly resolved = new Map<number, Resolved>();
  /** Widths of the strings measured for wrapping (words repeat): at most one entry per word of the text. */
  private readonly widths = new Map<string, number>();
  private readonly fallbacks = new Map<number, LoadedFont>();
  private readonly fallbackIds: readonly string[];

  constructor(
    private readonly context: RenderContext,
    private readonly options: TextShaperOptions,
  ) {
    this.fallbackIds = fontFallbacks(ownEntry(context.design.assets?.fonts, options.referenced));
  }

  get primary(): LoadedFont {
    return this.options.primary;
  }

  /** Width of a text laid out on one line. */
  measure(text: string): number {
    let width = this.widths.get(text);
    if (width === undefined) {
      width = this.walk(text, undefined);
      this.widths.set(text, width);
    }
    return width;
  }

  layout(text: string): { width: number; glyphs: ShapedGlyph[] } {
    const glyphs: ShapedGlyph[] = [];
    const width = this.walk(text, glyphs);
    return { width, glyphs };
  }

  private walk(text: string, sink: ShapedGlyph[] | undefined): number {
    let x = 0;
    let previous: Resolved | undefined;
    for (let index = 0; index < text.length; index++) {
      const codePoint = text.codePointAt(index) ?? 0;
      if (codePoint > 0xffff) index++;
      const current = this.resolve(codePoint);
      const font = current.font;
      if (font?.kerning === true && previous?.font === font) {
        x += this.kern(font, previous.glyph, current.glyph);
      }
      sink?.push({ font, glyph: current.glyph, codePoint, x });
      x += current.advance;
      previous = current;
    }
    return x;
  }

  private resolve(codePoint: number): Resolved {
    const cached = this.resolved.get(codePoint);
    if (cached !== undefined) return cached;
    const primary = this.options.primary;
    let font: LoadedFont | undefined;
    let glyph = primary.font.glyphFor(codePoint);
    if (glyph !== 0) font = primary;
    for (let index = 0; font === undefined && index < this.fallbackIds.length; index++) {
      const fallback = this.fallback(index);
      const candidate = fallback.font.glyphFor(codePoint);
      if (candidate !== 0) {
        font = fallback;
        glyph = candidate;
      }
    }
    const metrics = (font ?? primary).font;
    const advance =
      (metrics.advanceOf(glyph) * this.options.fontSize) / metrics.unitsPerEm +
      this.options.letterSpacing;
    const resolved = { font, glyph, advance };
    this.resolved.set(codePoint, resolved);
    return resolved;
  }

  private kern(font: LoadedFont, left: number, right: number): number {
    let units: number;
    try {
      units = font.font.kerning(left, right);
    } catch (error) {
      return fontFault(this.context, font, error);
    }
    return (units * this.options.fontSize) / font.font.unitsPerEm;
  }

  /** Loaded on first need: a fallback no character needs is never read. */
  private fallback(index: number): LoadedFont {
    const known = this.fallbacks.get(index);
    if (known !== undefined) return known;
    const id = this.fallbackIds[index] ?? "";
    const path = pointer(
      pointer(pointer("/assets/fonts", this.options.referenced), "fallback"),
      index,
    );
    const weight = this.options.weight ?? this.options.primary.weight;
    const loaded = selectFont(this.context, id, weight, path, this.options.primary.style);
    this.fallbacks.set(index, loaded);
    return loaded;
  }
}
