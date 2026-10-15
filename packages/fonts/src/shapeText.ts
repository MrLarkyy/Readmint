import { ApplyContext } from "./layout/ApplyContext.js";
import { finishOffsets } from "./layout/finishOffsets.js";
import { FontLayout } from "./layout/FontLayout.js";
import { GlyphClass, type Gdef } from "./layout/Gdef.js";
import { GlyphBuffer, glyphInfo, Joiner, type GlyphInfo } from "./layout/GlyphBuffer.js";
import { applyGposSubtable } from "./layout/GposLookups.js";
import { applyGsubSubtable } from "./layout/GsubLookups.js";
import { maxBufferLength, ShapingBudget } from "./layout/ShapingBudget.js";
import { fallbackSpaceAdvance } from "./fallbackSpaceAdvance.js";
import { glyphForCharacter } from "./glyphForCharacter.js";
import { normalizeText } from "./normalizeCharacters.js";
import type { SfntFont } from "./SfntFont.js";
import type { ShapedRun } from "./ShapedRun.js";
import type { ShapeOptions } from "./ShapeOptions.js";
import type { ShapePlan } from "./shaping/ShapePlan.js";
import type { ShapingState } from "./shaping/Shaper.js";
import { mirrorOf } from "./unicode/bidiMirror.js";
import { isDefaultIgnorable, isNonSpacingMark } from "./unicode/characterFlags.js";
import { scriptOf, type ScriptCode } from "./unicode/scriptOf.js";
import { spaceFallbackOf } from "./unicode/spaceFallback.js";

const zwnj = 0x200c;
const zwj = 0x200d;

/**
 * Shapes one run of text in one font (OpenType layout as HarfBuzz does it): characters normalized against the font's
 * cmap per cluster (`normalizeCharacters`: canonically decomposed, marks ordered, recomposed into what the font maps,
 * so canonically equivalent texts shape alike), to glyphs through the cmap (a space variant the font lacks takes the U+0020 glyph with the HarfBuzz fallback advance, U+2011 the U+2010 or U+002D glyph; mirrored in a right-to-left run), the script's shaper (Arabic joining, Devanagari syllables and reordering, or the
 * default), GSUB lookups stage by stage, default ignorables removed, advances, GPOS lookups (or the legacy kern
 * table), mark advances zeroed and attachments resolved. Pure and deterministic: integer font units, no clock,
 * nothing taken from the platform's Unicode data. A broken or too costly layout table throws `MalformedFont`.
 */
export function shapeText(font: SfntFont, text: string, options: ShapeOptions = {}): ShapedRun {
  return shapeTextCounted(font, text, options).run;
}

/** `shapeText` with the operations its budget has spent and its cap (tests pin the work as counts, not time). */
export function shapeTextCounted(
  font: SfntFont,
  text: string,
  options: ShapeOptions = {},
): { run: ShapedRun; operations: number; maxOperations: number } {
  const layout = FontLayout.of(font);
  const rtl = options.rtl ?? false;
  const kerning = options.kerning ?? true;
  const plan = layout.plan({
    script: options.script ?? firstScript(text),
    rtl,
    kerning,
    ligatures: options.ligatures ?? true,
  });
  const characters = decode(font, text, plan, rtl);
  const budget = options.budget ?? ShapingBudget.forText(text.length);
  const buffer = new GlyphBuffer(characters, budget, maxBufferLength(characters.length));
  const state: ShapingState = { font, layout, plan, buffer };
  classify(layout.gdef, buffer.glyphs);
  plan.shaper.setup(state);
  substitute(state, rtl);
  const visible = buffer.glyphs.filter((info) => !info.ignorable);
  buffer.splice(0, buffer.length, visible);
  position(state, rtl, kerning);
  return {
    run: output(buffer.glyphs, rtl),
    operations: budget.used,
    maxOperations: budget.maxOperations,
  };
}

/** The first script of the text that is not Common, Inherited or unassigned; Common when it has none. */
function firstScript(text: string): ScriptCode {
  for (const char of text) {
    const script = scriptOf(char.codePointAt(0) ?? 0);
    if (script !== "Zyyy" && script !== "Zinh" && script !== "Zzzz") return script;
  }
  return "Zyyy";
}

/**
 * One glyph per normalized character, its cluster the start of its character cluster (`clusterStarts`: a base with
 * its marks and joiners), as HarfBuzz forms grapheme clusters and normalizes them before shaping.
 */
function decode(font: SfntFont, text: string, plan: ShapePlan, rtl: boolean): GlyphInfo[] {
  const characters: GlyphInfo[] = [];
  const normalized = normalizeText(text, (codePoint) => font.glyphFor(codePoint) !== 0);
  normalized.codePoints.forEach((codePoint, index) => {
    const info = glyphInfo(
      glyphForCharacter(font, codePoint),
      codePoint,
      normalized.clusters[index] ?? 0,
    );
    info.mask = plan.globalMask;
    if (rtl) {
      const mirror = mirrorOf(codePoint);
      const mirrored = mirror === undefined ? 0 : font.glyphFor(mirror);
      if (mirrored !== 0) info.glyph = mirrored;
      else if (mirror !== undefined) info.mask |= plan.mask("rtlm");
    }
    info.ignorable = isDefaultIgnorable(codePoint);
    info.joiner = codePoint === zwnj ? Joiner.zwnj : codePoint === zwj ? Joiner.zwj : Joiner.none;
    characters.push(info);
  });
  return characters;
}

/** GDEF classes; a font without them gets marks from Unicode (non-spacing marks) and bases for the rest. */
function classify(gdef: Gdef, glyphs: readonly GlyphInfo[]): void {
  for (const info of glyphs) {
    info.glyphClass = gdef.hasGlyphClasses
      ? gdef.glyphClass(info.glyph)
      : isNonSpacingMark(info.codePoint) && !info.ignorable
        ? GlyphClass.mark
        : GlyphClass.base;
  }
}

function substitute(state: ShapingState, rtl: boolean): void {
  const { layout, plan, buffer } = state;
  const gsub = layout.gsub;
  const context =
    gsub === undefined
      ? undefined
      : new ApplyContext(gsub, layout.gdef, buffer, rtl, applyGsubSubtable);
  for (const stage of plan.gsub) {
    if (gsub !== undefined && context !== undefined) {
      for (const planned of stage.lookups) {
        const lookup = gsub.lookup(planned.index);
        if (lookup !== undefined) context.applyLookup(lookup, planned);
      }
    }
    stage.pause?.(state);
  }
}

function position(state: ShapingState, rtl: boolean, kerning: boolean): void {
  const { font, layout, plan, buffer } = state;
  const glyphs = buffer.glyphs;
  for (const info of glyphs) info.xAdvance = font.advanceOf(info.glyph);
  setFallbackSpaces(font, glyphs);
  const gpos = layout.gpos;
  if (gpos !== undefined) {
    const context = new ApplyContext(gpos, layout.gdef, buffer, rtl, applyGposSubtable);
    for (const stage of plan.gpos) {
      for (const planned of stage.lookups) {
        const lookup = gpos.lookup(planned.index);
        if (lookup !== undefined) context.applyLookup(lookup, planned);
      }
    }
  }
  const legacy = kerning && !plan.gposKerns ? layout.legacyKerning : undefined;
  if (legacy !== undefined) {
    let previous: GlyphInfo | undefined;
    for (const info of glyphs) {
      if (info.glyphClass === GlyphClass.mark) continue;
      if (previous !== undefined) previous.xAdvance += legacy(previous.glyph, info.glyph);
      previous = info;
    }
  }
  if (plan.shaper.zeroMarks === "late") {
    for (const info of glyphs) {
      if (info.glyphClass !== GlyphClass.mark) continue;
      // Without GPOS a left-to-right mark hangs over the glyph before it.
      if (gpos === undefined && !rtl) info.xOffset -= info.xAdvance;
      info.xAdvance = 0;
    }
  }
  finishOffsets(buffer, rtl);
}

/** Space variants the font does not map take the HarfBuzz fallback advance, before GPOS adds kerning on top. */
function setFallbackSpaces(font: SfntFont, glyphs: readonly GlyphInfo[]): void {
  const space = font.glyphFor(0x20);
  if (space === 0) return;
  const spaceAdvance = font.advanceOf(space);
  for (const info of glyphs) {
    const fallback = spaceFallbackOf(info.codePoint);
    if (fallback === undefined || font.glyphFor(info.codePoint) !== 0) continue;
    info.xAdvance = fallbackSpaceAdvance(font, fallback, spaceAdvance);
  }
}

function output(glyphs: readonly GlyphInfo[], rtl: boolean): ShapedRun {
  const ordered = rtl ? [...glyphs].reverse() : glyphs;
  return {
    glyphs: ordered.map((info) => info.glyph),
    clusters: ordered.map((info) => info.cluster),
    advances: ordered.map((info) => info.xAdvance),
    xOffsets: ordered.map((info) => info.xOffset),
    yOffsets: ordered.map((info) => info.yOffset),
    marks: ordered.map((info) => info.glyphClass === GlyphClass.mark),
    rtl,
  };
}
