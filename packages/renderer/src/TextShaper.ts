import {
  clusterStarts,
  glyphForCharacter,
  isDefaultIgnorable,
  isNonSpacingMark,
  lineLevels,
  normalizeForFont,
  resolveLevels,
  scriptOf,
  shapeText,
  visualOrder,
  type BidiParagraph,
  type ScriptCode,
  type ShapedRun,
  type SfntFont,
  type ShapingBudget,
} from "@readmint/fonts";
import { fontFallbacks, selectFont, type LoadedFont } from "./loadFont.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo } from "./resolveValue.js";
import { withFont } from "./withFont.js";

/** A glyph of a laid-out line, in visual order; `font` undefined when no font covers its characters. */
export interface ShapedGlyph {
  readonly font: LoadedFont | undefined;
  readonly glyph: number;
  /** The first character of the glyph's cluster as the font maps it (`normalizeForFont`: U+00E9 for e U+0301). */
  readonly codePoint: number;
  /** The characters of the glyph's cluster as written, in logical order. */
  readonly text: string;
  /** Pen position plus the glyph's offset, from the left of the line. */
  readonly x: number;
  /** Vertical offset upwards (a mark on its base), 0 for most glyphs. */
  readonly y: number;
  /**
   * Whether drawing the glyph's character with the font draws exactly this glyph: one character, its cmap glyph, no
   * offset, not a mark, left to right. Every other glyph is written as a private-use character of the subset.
   */
  readonly plain: boolean;
  readonly rtl: boolean;
}

/** One line laid out: its glyphs left to right, its width and its paragraph's direction. */
export interface ShapedLine {
  readonly width: number;
  readonly glyphs: readonly ShapedGlyph[];
  /** The paragraph is right-to-left (its first strong character): start and end alignment follow it. */
  readonly rtl: boolean;
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
  /** Pointer of the text's content: where the render's shaping bound fails. */
  readonly path: string;
}

/** A run of one font, script and bidi level, logical UTF-16 range of the paragraph. */
interface Run {
  readonly start: number;
  readonly end: number;
  /** Index in the primary-then-fallbacks list. */
  readonly font: number;
  readonly script: ScriptCode;
  readonly level: number;
}

const missing = -1;

const isPrivateUse = (codePoint: number) =>
  (codePoint >= 0xe000 && codePoint <= 0xf8ff) || codePoint >= 0xf0000;

/**
 * Lays out text with the fonts' own shaping (`shapeText` of @readmint/fonts, the same code in Node and browsers):
 * each character cluster takes the first of the primary font and its fallbacks that has its base (a mark, joiner or
 * variation selector stays with its base's font when that font has it). Fonts are judged on the characters shaping
 * maps (`normalizeForFont`): a font with e and U+0301 has U+00E9, one with U+00E9 has e U+0301, so canonically
 * equivalent texts take the same fonts and glyphs. A paragraph's bidi levels split it into runs of one font, script
 * and level, each shaped once and cached; runs are put in visual order (UAX #9 L2); letter spacing follows every
 * cluster. Positions are summed left to right, so every engine adds the same numbers. Every
 * shaping call of the text (each word measured, each run laid out) spends one shared `budget`, so a hostile font
 * cannot cost a fresh allowance per word.
 */
export class TextShaper {
  /** Widths of the strings measured for wrapping (words repeat): at most one entry per word of the text. */
  private readonly widths = new Map<string, number>();
  private readonly shapedRuns = new Map<string, ShapedRun>();
  /** The font covering each cluster text (`fontCovering`), a single character included. */
  private readonly fontOf = new Map<string, number>();
  /** Cluster texts as each font maps them, keyed by font index and text. */
  private readonly normalized = new Map<string, string>();
  private readonly fallbacks = new Map<number, LoadedFont>();
  private readonly fallbackIds: readonly string[];

  constructor(
    private readonly context: RenderContext,
    private readonly options: TextShaperOptions,
    private readonly budget: ShapingBudget,
  ) {
    this.fallbackIds = fontFallbacks(ownEntry(context.design.assets?.fonts, options.referenced));
  }

  get primary(): LoadedFont {
    return this.options.primary;
  }

  /** Width of a text laid out on one line, as a paragraph of its own. */
  measure(text: string): number {
    let width = this.widths.get(text);
    if (width === undefined) {
      width = this.layout(text, resolveLevels(text), 0, text.length).width;
      this.widths.set(text, width);
    }
    return width;
  }

  /** The pieces a too-wide word may break into: character clusters, joined where shaping joined them. */
  clusters(word: string): string[] {
    const shaped = new Set<number>();
    const bidi = resolveLevels(word);
    for (const run of this.runs(word, bidi, 0, word.length)) {
      for (const cluster of this.shape(word, run).clusters) shaped.add(run.start + cluster);
    }
    const starts = clusterStarts(word).filter((start) => start === 0 || shaped.has(start));
    return starts.map((start, index) => word.slice(start, starts[index + 1] ?? word.length));
  }

  /** The bidi levels of a paragraph (a hard line), its direction from its first strong character. */
  paragraph(text: string): BidiParagraph {
    return resolveLevels(text);
  }

  /** Whether no font of the text has a character, own or as a space / hyphen fallback (it is then not drawn and keeps the .notdef advance). */
  lacks(codePoint: number): boolean {
    return !isDefaultIgnorable(codePoint) && this.fontFor(codePoint) === missing;
  }

  /** One line, UTF-16 range [start, end) of its paragraph, laid out left to right. */
  layout(paragraph: string, bidi: BidiParagraph, start: number, end: number): ShapedLine {
    const runs = this.runs(paragraph, bidi, start, end);
    const order = visualOrder(runs.map((run) => run.level));
    const glyphs: ShapedGlyph[] = [];
    let pen = 0;
    for (const index of order) {
      const run = runs[index];
      if (run !== undefined) pen = this.place(paragraph, run, pen, glyphs);
    }
    return { width: pen, glyphs, rtl: bidi.level === 1 };
  }

  /** Appends a run's glyphs at pen position `pen`; the pen position after them. */
  private place(paragraph: string, run: Run, pen: number, glyphs: ShapedGlyph[]): number {
    const font = this.font(run.font);
    const shaped = this.shape(paragraph, run);
    const { fontSize, letterSpacing } = this.options;
    const metrics = font.font;
    const scaled = (units: number) => (units * fontSize) / metrics.unitsPerEm;
    const ends = clusterEnds(shaped, run);
    const drawn = run.font === missing ? undefined : font;
    const rtl = run.level % 2 === 1;
    let x = pen;
    shaped.glyphs.forEach((glyph, index) => {
      const cluster = run.start + (shaped.clusters[index] ?? 0);
      const text = paragraph.slice(cluster, ends.get(cluster) ?? run.end);
      const mapped = this.normalize(run.font, text);
      const codePoint = mapped.codePointAt(0) ?? 0;
      const xOffset = shaped.xOffsets[index] ?? 0;
      const yOffset = shaped.yOffsets[index] ?? 0;
      const single = mapped.length === (codePoint > 0xffff ? 2 : 1);
      glyphs.push({
        font: glyph === 0 ? undefined : drawn,
        glyph,
        codePoint,
        text,
        x: xOffset === 0 ? x : x + scaled(xOffset),
        y: yOffset === 0 ? 0 : scaled(yOffset),
        plain:
          single &&
          !rtl &&
          xOffset === 0 &&
          yOffset === 0 &&
          shaped.marks[index] !== true &&
          !isNonSpacingMark(codePoint) &&
          !isPrivateUse(codePoint) &&
          glyph === metrics.glyphFor(codePoint),
        rtl,
      });
      // The base advance, letter spacing after the cluster's last glyph, then what GPOS added (kerning) before the
      // next glyph: the order the sums ran in before shaping, so unshaped text keeps its exact positions.
      const base = metrics.advanceOf(glyph);
      const lastOfCluster = shaped.clusters[index + 1] !== shaped.clusters[index];
      x += scaled(base) + (lastOfCluster ? letterSpacing : 0);
      const adjustment = (shaped.advances[index] ?? base) - base;
      if (adjustment !== 0) x += scaled(adjustment);
    });
    return x;
  }

  /** Runs of one font, script and level for a line (levels after rule L1), in logical order. */
  private runs(paragraph: string, bidi: BidiParagraph, start: number, end: number): Run[] {
    const levels = lineLevels(bidi, start, end);
    const fonts = this.clusterFonts(paragraph, start, end);
    const scripts = resolvedScripts(paragraph, start, end);
    const runs: Run[] = [];
    const run = (from: number, to: number): Run => ({
      start: from,
      end: to,
      font: fonts[from - start] ?? missing,
      script: scripts[from - start] ?? "Zyyy",
      level: levels[from - start] ?? 0,
    });
    let runStart = start;
    for (let index = start + 1; index < end; index++) {
      if (isLowSurrogateAt(paragraph, index)) continue;
      const at = index - start;
      const first = runStart - start;
      if (
        fonts[at] !== fonts[first] ||
        scripts[at] !== scripts[first] ||
        levels[at] !== levels[first]
      ) {
        runs.push(run(runStart, index));
        runStart = index;
      }
    }
    if (end > start) runs.push(run(runStart, end));
    return runs;
  }

  /**
   * The font of every UTF-16 unit of [start, end): a cluster takes the first font that covers all of it as shaping maps
   * it; when none does, its base takes the first font that has it and each further character stays in that font when
   * it has the character (or the character is ignorable) and takes its own otherwise.
   */
  private clusterFonts(paragraph: string, start: number, end: number): number[] {
    const fonts = new Array<number>(end - start).fill(missing);
    const text = paragraph.slice(start, end);
    const starts = clusterStarts(text);
    starts.forEach((from, at) => {
      const to = starts[at + 1] ?? text.length;
      const whole = this.fontCovering(text.slice(from, to));
      if (whole !== missing) {
        fonts.fill(whole, from, to);
        return;
      }
      const base = this.fontFor(text.codePointAt(from) ?? 0);
      for (let index = from; index < to; index++) {
        const codePoint = text.codePointAt(index) ?? 0;
        let font: number;
        if (index === from) {
          font = base;
        } else if (
          base !== missing &&
          (isDefaultIgnorable(codePoint) ||
            glyphForCharacter(this.font(base).font, codePoint) !== 0)
        ) {
          font = base;
        } else {
          font = isDefaultIgnorable(codePoint) ? base : this.fontFor(codePoint);
        }
        fonts[index] = font;
        if (codePoint > 0xffff) {
          fonts[index + 1] = font;
          index++;
        }
      }
    });
    return fonts;
  }

  /** The first font (primary, then fallbacks) that covers the character; `missing` when none does. */
  private fontFor(codePoint: number): number {
    return this.fontCovering(String.fromCodePoint(codePoint));
  }

  /** The first font (primary, then fallbacks) that covers a cluster's text; `missing` when none does. */
  private fontCovering(text: string): number {
    let found = this.fontOf.get(text);
    if (found === undefined) {
      found = missing;
      for (let index = 0; found === missing && index <= this.fallbackIds.length; index++) {
        if (covers(this.font(index).font, text)) found = index;
      }
      this.fontOf.set(text, found);
    }
    return found;
  }

  /** A cluster's text as font `index` maps it (`normalizeForFont`), cached per font and text. */
  private normalize(index: number, text: string): string {
    const key = `${String(index)}|${text}`;
    let mapped = this.normalized.get(key);
    if (mapped === undefined) {
      mapped = normalizeForFont(this.font(index).font, text);
      this.normalized.set(key, mapped);
    }
    return mapped;
  }

  /** Shapes a run once per text (repeated words share the result). */
  private shape(paragraph: string, run: Run): ShapedRun {
    const text = paragraph.slice(run.start, run.end);
    const rtl = run.level % 2 === 1;
    const key = `${String(run.font)}|${run.script}|${rtl ? "r" : "l"}|${text}`;
    let shaped = this.shapedRuns.get(key);
    if (shaped === undefined) {
      const font = this.font(run.font);
      const before = this.budget.used;
      shaped = withFont(this.context, font, () =>
        shapeText(font.font, text, {
          script: run.script,
          rtl,
          kerning: font.kerning,
          ligatures: this.options.letterSpacing === 0,
          budget: this.budget,
        }),
      );
      // The text's own budget bounds one text (asset-format); the render's bounds all texts together.
      this.context.chargeShaping(
        this.budget.used - before,
        this.options.path,
        `font asset ${echo(font.asset)}`,
      );
      this.shapedRuns.set(key, shaped);
    }
    return shaped;
  }

  /** Font `index` of the list: 0 the primary (also for characters no font has), then the fallbacks. */
  private font(index: number): LoadedFont {
    if (index <= 0) return this.options.primary;
    const known = this.fallbacks.get(index);
    if (known !== undefined) return known;
    const id = this.fallbackIds[index - 1] ?? "";
    const path = pointer(
      pointer(pointer("/assets/fonts", this.options.referenced), "fallback"),
      index - 1,
    );
    const weight = this.options.weight ?? this.options.primary.weight;
    const loaded = selectFont(this.context, id, weight, path, this.options.primary.style);
    this.fallbacks.set(index, loaded);
    return loaded;
  }
}

/**
 * Whether a font draws a text as shaping maps it: every character of `normalizeForFont` has a glyph (its own, or the
 * space / hyphen fallback of `glyphForCharacter`) or is a default ignorable, and at least one has a glyph.
 */
function covers(font: SfntFont, text: string): boolean {
  let drawn = false;
  for (const char of normalizeForFont(font, text)) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (glyphForCharacter(font, codePoint) !== 0) drawn = true;
    else if (!isDefaultIgnorable(codePoint)) return false;
  }
  return drawn;
}

function isLowSurrogateAt(text: string, index: number): boolean {
  const unit = text.charCodeAt(index);
  const previous = text.charCodeAt(index - 1);
  return unit >= 0xdc00 && unit <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff;
}

/** Where each cluster of a shaped run ends in the paragraph: the next larger cluster start, or the run's end. */
function clusterEnds(shaped: ShapedRun, run: Run): Map<number, number> {
  const starts = [...new Set(shaped.clusters)].sort((left, right) => left - right);
  return new Map(
    starts.map((start, index) => [
      run.start + start,
      starts[index + 1] === undefined ? run.end : run.start + (starts[index + 1] ?? 0),
    ]),
  );
}

/**
 * The script of every UTF-16 unit of [start, end): Common, Inherited and unassigned characters take the script
 * before them (or, at the start, the first one after them), so punctuation and spaces stay in their word's run.
 */
function resolvedScripts(paragraph: string, start: number, end: number): ScriptCode[] {
  const scripts = new Array<ScriptCode>(end - start).fill("Zyyy");
  let current: ScriptCode | undefined;
  const pending: number[] = [];
  for (let index = start; index < end; index++) {
    const codePoint = paragraph.codePointAt(index) ?? 0;
    const script = scriptOf(codePoint);
    const width = codePoint > 0xffff ? 2 : 1;
    if (script === "Zyyy" || script === "Zinh" || script === "Zzzz") {
      if (current === undefined) pending.push(index - start, width);
      else scripts.fill(current, index - start, index - start + width);
    } else {
      current = script;
      scripts.fill(script, index - start, index - start + width);
      for (let at = 0; at < pending.length; at += 2) {
        const offset = pending[at] ?? 0;
        scripts.fill(script, offset, offset + (pending[at + 1] ?? 1));
      }
      pending.length = 0;
    }
    index += width - 1;
  }
  return scripts;
}
