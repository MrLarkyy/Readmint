import type { ApplyContext } from "./ApplyContext.js";
import type { GlyphInfo } from "./GlyphBuffer.js";
import { Joiner } from "./GlyphBuffer.js";

const Skip = { no: 0, yes: 1, maybe: 2 } as const;
type Skip = (typeof Skip)[keyof typeof Skip];

/**
 * Steps through the buffer the way a lookup sees it (HarfBuzz skipping_iterator_t): glyphs its lookup flag ignores
 * are stepped over; default ignorables are stepped over unless they match (ZWNJ and ZWJ only where the feature or
 * the table lets joiners be ignored); an input glyph must carry the lookup's feature mask and, for a per-syllable
 * feature, stay in the syllable the match started in. Every glyph looked at costs one operation.
 */
export class SkippingIterator {
  private readonly mask: number;
  private readonly ignoreZwnj: boolean;
  private readonly ignoreZwj: boolean;

  constructor(
    private readonly context: ApplyContext,
    contextMatch: boolean,
    private readonly syllable: number,
    private readonly flag = context.lookupFlag,
    private readonly markSet = context.markFilteringSet,
  ) {
    this.mask = contextMatch ? -1 : context.lookupMask;
    const positioning = context.table.kind === "GPOS";
    this.ignoreZwnj = positioning || (contextMatch && context.autoZwnj);
    this.ignoreZwj = positioning || contextMatch || context.autoZwj;
  }

  /** The next glyph after `from` the lookup sees and `match` accepts, -1 when there is none. */
  next(from: number, match?: (info: GlyphInfo) => boolean): number {
    const glyphs = this.context.buffer.glyphs;
    for (let index = from + 1; index < glyphs.length; index++) {
      const found = this.step(glyphs[index], match);
      if (found === true) return index;
      if (found === false) return -1;
    }
    return -1;
  }

  /** The previous glyph before `from` the lookup sees and `match` accepts, -1 when there is none. */
  prev(from: number, match?: (info: GlyphInfo) => boolean): number {
    const glyphs = this.context.buffer.glyphs;
    for (let index = from - 1; index >= 0; index--) {
      const found = this.step(glyphs[index], match);
      if (found === true) return index;
      if (found === false) return -1;
    }
    return -1;
  }

  /** true: this glyph is the one; false: the walk stops without a match; undefined: step over it. */
  private step(
    info: GlyphInfo | undefined,
    match: ((info: GlyphInfo) => boolean) | undefined,
  ): boolean | undefined {
    this.context.buffer.budget.charge();
    if (info === undefined) return false;
    const skip = this.maySkip(info);
    if (skip === Skip.yes) return undefined;
    const matches =
      (info.mask & this.mask) === 0 || (this.syllable !== 0 && info.syllable !== this.syllable)
        ? false
        : match === undefined
          ? undefined
          : match(info);
    if (matches === true || (matches === undefined && skip === Skip.no)) return true;
    if (skip === Skip.no) return false;
    return undefined;
  }

  private maySkip(info: GlyphInfo): Skip {
    if (!this.context.passes(info, this.flag, this.markSet)) return Skip.yes;
    if (
      info.ignorable &&
      (this.ignoreZwnj || info.joiner !== Joiner.zwnj) &&
      (this.ignoreZwj || info.joiner !== Joiner.zwj)
    ) {
      return Skip.maybe;
    }
    return Skip.no;
  }
}
