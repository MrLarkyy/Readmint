import { MalformedFont } from "../MalformedFont.js";
import type { Gdef } from "./Gdef.js";
import { GlyphClass } from "./Gdef.js";
import type { GlyphBuffer, GlyphInfo } from "./GlyphBuffer.js";
import type { LayoutTable, Lookup } from "./LayoutTable.js";
import { LookupFlag } from "./LayoutTable.js";
import { maxNesting } from "./ShapingBudget.js";
import { SkippingIterator } from "./SkippingIterator.js";

/**
 * Applies one subtable of a lookup at glyph `index`: the index the lookup continues at, undefined when the subtable
 * does not apply there.
 */
export type SubtableApply = (
  context: ApplyContext,
  type: number,
  subtable: number,
  index: number,
) => number | undefined;

/** How a lookup of a plan stage is applied. */
export interface LookupOptions {
  readonly mask: number;
  readonly autoZwj: boolean;
  readonly autoZwnj: boolean;
  readonly perSyllable: boolean;
}

const reverseChaining = 8;

/** The state of applying GSUB or GPOS lookups to a buffer (HarfBuzz hb_ot_apply_context_t). */
export class ApplyContext {
  lookupMask = 1;
  autoZwj = true;
  autoZwnj = true;
  perSyllable = false;
  private lookup: Lookup | undefined;
  /**
   * The base a mark last attached to and the glyph the search for it stopped at (HarfBuzz last_base): marks after
   * it search back only to there, so a long run of marks costs linear work. Reset for every lookup pass.
   */
  lastBase = -1;
  lastBaseUntil = 0;
  private depth = 0;
  private nextLigatureId = 1;

  constructor(
    readonly table: LayoutTable,
    readonly gdef: Gdef,
    readonly buffer: GlyphBuffer,
    readonly rtl: boolean,
    private readonly apply: SubtableApply,
  ) {}

  get lookupFlag(): number {
    return this.lookup?.flag ?? 0;
  }

  get markFilteringSet(): number {
    return this.lookup?.markFilteringSet ?? -1;
  }

  /** Whether a lookup is being applied from inside a context lookup. */
  get nested(): boolean {
    return this.depth > 0;
  }

  /** A fresh ligature id. */
  allocateLigatureId(): number {
    return this.nextLigatureId++;
  }

  /** Applies a lookup to every glyph of the buffer carrying `options.mask`. */
  applyLookup(lookup: Lookup, options: LookupOptions): void {
    this.lookup = lookup;
    this.lookupMask = options.mask;
    this.lastBase = -1;
    this.lastBaseUntil = 0;
    this.autoZwj = options.autoZwj;
    this.autoZwnj = options.autoZwnj;
    this.perSyllable = options.perSyllable;
    const glyphs = this.buffer.glyphs;
    if (this.table.kind === "GSUB" && lookup.type === reverseChaining) {
      for (let index = glyphs.length - 1; index >= 0; index--) {
        const info = glyphs[index];
        if (info !== undefined && this.applies(lookup, info)) this.applyAt(lookup, index);
      }
      return;
    }
    let index = 0;
    while (index < glyphs.length) {
      const info = glyphs[index];
      if (info !== undefined && this.applies(lookup, info)) {
        const next = this.applyAt(lookup, index);
        // A deleting substitution continues at the same index (the buffer is shorter); the budget bounds the rest.
        if (next !== undefined) {
          index = next;
          continue;
        }
      }
      index++;
    }
  }

  /** Applies lookup `index` at one glyph from inside a context lookup; whether it applied. */
  applyNested(lookupIndex: number, index: number): boolean {
    const lookup = this.table.lookup(lookupIndex);
    const info = this.buffer.glyphs[index];
    if (lookup === undefined || info === undefined) return false;
    if (this.depth >= maxNesting) {
      throw new MalformedFont(
        `font ${this.table.kind} lookups nest deeper than ${String(maxNesting)} levels`,
      );
    }
    if (this.table.kind === "GSUB" && lookup.type === reverseChaining) return false;
    if (!lookup.digest.mayHave(info.glyph)) return false;
    const saved = this.lookup;
    this.lookup = lookup;
    this.depth++;
    try {
      return this.applyAt(lookup, index) !== undefined;
    } finally {
      this.depth--;
      this.lookup = saved;
    }
  }

  /** An iterator over the input (`context` false) or the backtrack and lookahead (`context` true) of a match at `start`. */
  iterator(context: boolean, start: number): SkippingIterator {
    const syllable = this.perSyllable ? (this.buffer.glyphs[start]?.syllable ?? 0) : 0;
    return new SkippingIterator(this, context, syllable);
  }

  /** An input iterator with its own lookup flag (mark attachment finds its base this way). */
  iteratorWithFlag(start: number, flag: number, markSet: number): SkippingIterator {
    const syllable = this.perSyllable ? (this.buffer.glyphs[start]?.syllable ?? 0) : 0;
    return new SkippingIterator(this, false, syllable, flag, markSet);
  }

  /** Whether a lookup with `flag` (and mark filtering set `markSet`) sees the glyph (HarfBuzz check_glyph_property). */
  passes(info: GlyphInfo, flag: number, markSet: number): boolean {
    const glyphClass = info.glyphClass;
    if (glyphClass === GlyphClass.base && (flag & LookupFlag.ignoreBaseGlyphs) !== 0) return false;
    if (glyphClass === GlyphClass.ligature && (flag & LookupFlag.ignoreLigatures) !== 0)
      return false;
    if (glyphClass !== GlyphClass.mark) return true;
    if ((flag & LookupFlag.ignoreMarks) !== 0) return false;
    if ((flag & LookupFlag.useMarkFilteringSet) !== 0)
      return this.gdef.inMarkSet(markSet, info.glyph);
    const attachment = (flag & LookupFlag.markAttachmentType) >> 8;
    return attachment === 0 || this.gdef.markAttachClass(info.glyph) === attachment;
  }

  /**
   * Gives a glyph its substitute: the GDEF class of the new glyph when the font classifies glyphs, else `guess`
   * (or the old class when there is no guess).
   */
  substitute(
    info: GlyphInfo,
    glyph: number,
    options: {
      readonly guess?: number;
      readonly ligature?: boolean;
      readonly component?: boolean;
    } = {},
  ): void {
    info.glyph = glyph;
    info.substituted = true;
    // A substituted default ignorable is drawn like any glyph (HarfBuzz hides only untouched ones).
    info.ignorable = false;
    if (options.ligature === true) {
      info.ligated = true;
      info.multiplied = false;
    }
    if (options.component === true) info.multiplied = true;
    if (this.gdef.hasGlyphClasses) info.glyphClass = this.gdef.glyphClass(glyph);
    else if (options.guess !== undefined && options.guess !== 0) info.glyphClass = options.guess;
  }

  private applies(lookup: Lookup, info: GlyphInfo): boolean {
    return (
      (info.mask & this.lookupMask) !== 0 &&
      lookup.digest.mayHave(info.glyph) &&
      this.passes(info, lookup.flag, lookup.markFilteringSet)
    );
  }

  private applyAt(lookup: Lookup, index: number): number | undefined {
    for (const subtable of lookup.subtables) {
      this.buffer.budget.charge();
      const next = this.apply(this, lookup.type, subtable, index);
      if (next !== undefined) return next;
    }
    return undefined;
  }
}
