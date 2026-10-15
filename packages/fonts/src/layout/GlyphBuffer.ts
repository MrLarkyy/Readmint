import { MalformedFont } from "../MalformedFont.js";
import type { ShapingBudget } from "./ShapingBudget.js";

/** How a glyph attaches to another one after GPOS: by a mark anchor or a cursive connection. */
export const AttachType = { none: 0, mark: 1, cursive: 2 } as const;

/** Joiner kind of a glyph's character. */
export const Joiner = { none: 0, zwnj: 1, zwj: 2 } as const;

/** One glyph in the shaping buffer: what it came from, how lookups see it and where GPOS put it (font units). */
export interface GlyphInfo {
  glyph: number;
  /** The character it came from (the first one for a ligature). */
  codePoint: number;
  /** UTF-16 offset in the run text of the first character of its cluster. */
  cluster: number;
  /** Features that apply to it (bit per feature, see ShapePlan). */
  mask: number;
  /** GDEF class (or the one derived from Unicode): GlyphClass. */
  glyphClass: number;
  /** Ligature id and component of a ligature or of a mark attached to one (0: none). */
  ligatureId: number;
  ligatureComponent: number;
  /** Components of the ligature this glyph is (0: not a ligature). */
  ligatureComponents: number;
  substituted: boolean;
  ligated: boolean;
  multiplied: boolean;
  /** A default ignorable character: matched past, then removed from the output. */
  ignorable: boolean;
  joiner: number;
  /** Syllable number for per-syllable features (0: none). */
  syllable: number;
  /** Shaper data: the Indic category or the Arabic joining action. */
  category: number;
  /** Shaper data: the Indic position. */
  position: number;
  xAdvance: number;
  xOffset: number;
  yOffset: number;
  /** Index difference to the glyph this one attaches to (0: none). */
  attachChain: number;
  attachType: number;
}

/** A glyph for a character, before any lookup. */
export function glyphInfo(glyph: number, codePoint: number, cluster: number): GlyphInfo {
  return {
    glyph,
    codePoint,
    cluster,
    mask: 0,
    glyphClass: 0,
    ligatureId: 0,
    ligatureComponent: 0,
    ligatureComponents: 0,
    substituted: false,
    ligated: false,
    multiplied: false,
    ignorable: false,
    joiner: 0,
    syllable: 0,
    category: 0,
    position: 0,
    xAdvance: 0,
    xOffset: 0,
    yOffset: 0,
    attachChain: 0,
    attachType: 0,
  };
}

/**
 * The glyphs of one shaping call, in logical order. Every change of its length goes through `splice`, which charges
 * the budget for the glyphs it moves and refuses a buffer past `maxLength`.
 */
export class GlyphBuffer {
  readonly glyphs: GlyphInfo[];

  constructor(
    glyphs: GlyphInfo[],
    readonly budget: ShapingBudget,
    readonly maxLength: number,
  ) {
    this.glyphs = glyphs;
  }

  get length(): number {
    return this.glyphs.length;
  }

  at(index: number): GlyphInfo {
    const info = this.glyphs[index];
    if (info === undefined) throw new RangeError(`glyph ${String(index)} is outside the buffer`);
    return info;
  }

  /** Replaces `count` glyphs at `index` with `items`. */
  splice(index: number, count: number, items: readonly GlyphInfo[]): void {
    const length = this.glyphs.length - count + items.length;
    if (length > this.maxLength) {
      throw new MalformedFont(
        `font layout tables grow the text past ${String(this.maxLength)} glyphs`,
      );
    }
    this.budget.charge(1 + ((this.glyphs.length - index) >>> 6));
    this.glyphs.splice(index, count, ...items);
  }

  /** Moves the glyph at `from` to `to`, shifting the ones between. */
  move(from: number, to: number): void {
    if (from === to) return;
    this.budget.charge(1 + (Math.abs(to - from) >>> 6));
    const [info] = this.glyphs.splice(from, 1);
    if (info !== undefined) this.glyphs.splice(to, 0, info);
  }

  /**
   * Every glyph in [start, end), widened over neighbours sharing the cluster at either edge, gets the smallest
   * cluster among them (HarfBuzz merge_clusters), so a cluster stays one contiguous run of glyphs.
   */
  mergeClusters(start: number, end: number): void {
    if (end - start < 2) return;
    const glyphs = this.glyphs;
    // Already one cluster: nothing changes, and the (bounded) cluster is not walked again.
    this.budget.charge(1 + ((end - start) >>> 6));
    let uniform = true;
    for (let index = start + 1; index < end && uniform; index++) {
      uniform = glyphs[index]?.cluster === glyphs[start]?.cluster;
    }
    if (uniform) return;
    while (end < glyphs.length && glyphs[end - 1]?.cluster === glyphs[end]?.cluster) end++;
    while (start > 0 && glyphs[start - 1]?.cluster === glyphs[start]?.cluster) start--;
    this.budget.charge(1 + ((end - start) >>> 6));
    let cluster = Infinity;
    for (let index = start; index < end; index++) {
      cluster = Math.min(cluster, this.glyphs[index]?.cluster ?? Infinity);
    }
    for (let index = start; index < end; index++) {
      const info = this.glyphs[index];
      if (info !== undefined) info.cluster = cluster;
    }
  }
}
