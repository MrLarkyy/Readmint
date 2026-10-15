import { wouldSubstitute } from "../layout/GsubLookups.js";
import { glyphInfo, type GlyphInfo } from "../layout/GlyphBuffer.js";
import { GlyphClass } from "../layout/Gdef.js";
import { isStrong } from "../unicode/bidiClass.js";
import { isFormat, isNonSpacingMark, isSpacingMark } from "../unicode/characterFlags.js";
import {
  Category,
  consonants,
  dottedCircle,
  indicProperties,
  Position,
} from "./indicCategories.js";
import { findSyllables, SyllableType } from "./indicSyllables.js";
import type { PlanBuilder } from "./PlanBuilder.js";
import type { Shaper, ShapingState } from "./Shaper.js";

const virama = 0x094d;
/** Per-syllable basic features, each in its own stage, before final reordering (HarfBuzz indic_features). */
const basicFeatures: readonly (readonly [string, boolean])[] = [
  ["nukt", true],
  ["akhn", true],
  ["rphf", false],
  ["rkrf", true],
  ["pref", false],
  ["blwf", false],
  ["abvf", false],
  ["half", false],
  ["pstf", false],
  ["vatu", true],
  ["cjct", true],
];
/** Presentation features, all in one stage after final reordering. */
const presentationFeatures: readonly (readonly [string, boolean])[] = [
  ["init", false],
  ["pres", true],
  ["abvs", true],
  ["blws", true],
  ["psts", true],
  ["haln", true],
];

/** Syllable numbers carry the syllable type in their low three bits. */
const typeBits = 3;

function collectFeatures(builder: PlanBuilder): void {
  builder.pause(setupSyllables);
  builder.add("locl", { perSyllable: true });
  builder.add("ccmp", { perSyllable: true });
  builder.pause(initialReordering);
  for (const [tag, global] of basicFeatures) {
    builder.add(tag, { global, manualZwj: true, manualZwnj: true, perSyllable: true });
    builder.pause();
  }
  builder.pause(finalReordering);
  for (const [tag, global] of presentationFeatures) {
    builder.add(tag, { global, manualZwj: true, manualZwnj: true, perSyllable: true });
  }
}

function setup({ buffer }: ShapingState): void {
  for (const info of buffer.glyphs) {
    const { category, position } = indicProperties(info.codePoint);
    info.category = category;
    info.position = position;
  }
}

const is = (info: GlyphInfo | undefined, category: number) => info?.category === category;
const isConsonant = (info: GlyphInfo | undefined) =>
  info !== undefined && consonants.has(info.category);
const isJoiner = (info: GlyphInfo | undefined) => is(info, Category.ZWJ) || is(info, Category.ZWNJ);
const isHalant = (info: GlyphInfo | undefined) => is(info, Category.H);

/** Syllable ranges of the buffer from the syllable numbers (consecutive glyphs sharing one). */
function syllableRanges(
  glyphs: readonly GlyphInfo[],
): { start: number; end: number; type: number }[] {
  const ranges: { start: number; end: number; type: number }[] = [];
  let start = 0;
  while (start < glyphs.length) {
    const syllable = glyphs[start]?.syllable ?? 0;
    let end = start + 1;
    while (end < glyphs.length && glyphs[end]?.syllable === syllable) end++;
    ranges.push({ start, end, type: syllable & ((1 << typeBits) - 1) });
    start = end;
  }
  return ranges;
}

/** Finds syllables and puts a dotted circle at the start of every broken one when the font has the glyph. */
function setupSyllables({ buffer, font, plan, layout }: ShapingState): void {
  const syllables = findSyllables(buffer.glyphs.map((info) => info.category));
  const circleGlyph = font.glyphFor(dottedCircle);
  const inserted: GlyphInfo[] = [];
  syllables.forEach((syllable, serial) => {
    const number = ((serial + 1) << typeBits) | syllable.type;
    if (syllable.type === SyllableType.broken && circleGlyph !== 0) {
      const first = buffer.at(syllable.start);
      const circle = glyphInfo(circleGlyph, dottedCircle, first.cluster);
      const { category, position } = indicProperties(dottedCircle);
      circle.category = category;
      circle.position = position;
      circle.mask = plan.globalMask;
      circle.syllable = number;
      circle.glyphClass = layout.gdef.hasGlyphClasses
        ? layout.gdef.glyphClass(circleGlyph)
        : GlyphClass.base;
      inserted.push(circle);
    }
    for (let index = syllable.start; index < syllable.end; index++) {
      const info = buffer.at(index);
      info.syllable = number;
      inserted.push(info);
    }
  });
  buffer.splice(0, buffer.length, inserted);
}

function initialReordering(state: ShapingState): void {
  const { buffer, font, plan, layout } = state;
  const gsub = layout.gsub;
  const viramaGlyph = font.glyphFor(virama);
  // Each answer is computed once per font and plan, its lookup work charged to the text's budget.
  const would = (tag: string, glyphs: readonly number[]) => {
    const key = `${tag}:${glyphs.join(",")}`;
    let answer = plan.substitutions.get(key);
    if (answer === undefined) {
      answer =
        gsub !== undefined && wouldSubstitute(gsub, plan.gsubLookups(tag), glyphs, buffer.budget);
      plan.substitutions.set(key, answer);
    }
    return answer;
  };
  const positionOf = (consonant: number): number => {
    const pairs = [
      [viramaGlyph, consonant],
      [consonant, viramaGlyph],
    ];
    const any = (tag: string) => pairs.some((pair) => would(tag, pair));
    return any("blwf") || any("vatu")
      ? Position.belowC
      : any("pstf") || any("pref")
        ? Position.postC
        : Position.baseC;
  };
  for (const info of buffer.glyphs) {
    if (info.position === Position.baseC) info.position = positionOf(info.glyph);
  }
  for (const { start, end, type } of syllableRanges(buffer.glyphs)) {
    if (type === SyllableType.symbol || type === SyllableType.nonIndic) continue;
    reorderSyllable(state, start, end, would);
  }
}

/** Initial reordering of one consonant, vowel, standalone or broken syllable (HarfBuzz, Devanagari settings). */
function reorderSyllable(
  { buffer, plan }: ShapingState,
  start: number,
  end: number,
  would: (tag: string, glyphs: readonly number[]) => boolean,
): void {
  const glyphs = buffer.glyphs;
  const info = (index: number) => buffer.at(index);
  const oldSpec = plan.gsubScript === "deva";
  let base = end;
  let hasReph = false;
  let limit = start;
  if (
    plan.mask("rphf") !== 0 &&
    start + 3 <= end &&
    !isJoiner(glyphs[start + 2]) &&
    would("rphf", [info(start).glyph, info(start + 1).glyph])
  ) {
    limit += 2;
    while (limit < end && isJoiner(glyphs[limit])) limit++;
    base = start;
    hasReph = true;
  }
  let seenBelow = false;
  for (let index = end; index > limit;) {
    index--;
    const current = info(index);
    if (isConsonant(current)) {
      if (
        current.position !== Position.belowC &&
        (current.position !== Position.postC || seenBelow)
      ) {
        base = index;
        break;
      }
      if (current.position === Position.belowC) seenBelow = true;
      base = index;
    } else if (start < index && is(current, Category.ZWJ) && isHalant(glyphs[index - 1])) {
      break;
    }
  }
  if (hasReph && base === start && limit - base <= 2) hasReph = false;
  for (let index = start; index < base; index++) {
    info(index).position = Math.min(Position.preC, info(index).position);
  }
  if (base < end) info(base).position = Position.baseC;
  if (hasReph) info(start).position = Position.raToBecomeReph;
  if (oldSpec) moveOldSpecHalant(buffer.glyphs, base, end, buffer);
  attachMiscMarks(glyphs, start, end);
  for (let index = base + 1, last = base; index < end; index++) {
    const current = info(index);
    if (isConsonant(current)) {
      for (let between = last + 1; between < index; between++) {
        if (info(between).position < Position.smvd) info(between).position = current.position;
      }
      last = index;
    } else if (is(current, Category.M)) {
      last = index;
    }
  }
  base = sortSyllable(buffer, start, end);
  setMasks(buffer, plan, start, end, base);
}

/** Old-spec (deva) fonts: the first halant after the base moves after the last consonant. */
function moveOldSpecHalant(
  glyphs: GlyphInfo[],
  base: number,
  end: number,
  buffer: ShapingState["buffer"],
): void {
  for (let index = base + 1; index < end; index++) {
    if (!isHalant(glyphs[index])) continue;
    let target = end - 1;
    while (target > index && !isConsonant(glyphs[target])) target--;
    if (!isHalant(glyphs[target]) && target > index) buffer.move(index, target);
    break;
  }
}

/** Joiners, nuktas and halants take the position of the character before them, so they move with it. */
function attachMiscMarks(glyphs: GlyphInfo[], start: number, end: number): void {
  let lastPosition: number = Position.start;
  for (let index = start; index < end; index++) {
    const current = glyphs[index];
    if (current === undefined) continue;
    if (
      isJoiner(current) ||
      is(current, Category.N) ||
      is(current, Category.RS) ||
      is(current, Category.CM) ||
      isHalant(current)
    ) {
      current.position = lastPosition;
      if (isHalant(current) && current.position === Position.preM) {
        // Uniscribe does not move a halant with a left matra.
        for (let before = index; before > start; before--) {
          const previous = glyphs[before - 1];
          if (previous !== undefined && previous.position !== Position.preM) {
            current.position = previous.position;
            break;
          }
        }
      }
    } else if (current.position !== Position.smvd) {
      lastPosition = current.position;
    }
  }
}

/**
 * Sorts a syllable by position (stable) and merges the clusters of glyphs that moved past each other after the base;
 * a run of left matras keeps its logical order. The new base index (`end` when there is none).
 */
function sortSyllable(buffer: ShapingState["buffer"], start: number, end: number): number {
  const glyphs = buffer.glyphs;
  const slice = glyphs.slice(start, end).map((info, order) => ({ info, order }));
  buffer.budget.charge(1 + (slice.length >>> 3));
  slice.sort((left, right) => left.info.position - right.info.position || left.order - right.order);
  slice.forEach(({ info }, offset) => {
    glyphs[start + offset] = info;
  });
  let base = end;
  let firstLeft = end;
  let lastLeft = end;
  for (let index = start; index < end; index++) {
    const position = glyphs[index]?.position;
    if (position === Position.baseC) {
      base = index;
      break;
    }
    if (position === Position.preM) {
      if (firstLeft === end) firstLeft = index;
      lastLeft = index;
    }
  }
  if (firstLeft < lastLeft) {
    reverse(glyphs, firstLeft, lastLeft + 1);
    let from = firstLeft;
    for (let index = firstLeft; index <= lastLeft; index++) {
      if (is(glyphs[index], Category.M)) {
        reverse(glyphs, from, index + 1);
        from = index + 1;
      }
    }
  }
  // Each permutation cycle that moved glyphs at or after the base becomes one cluster (HarfBuzz's sort accounting).
  const origin = slice.map(({ order }) => order);
  const visited = new Array<boolean>(origin.length).fill(false);
  for (let index = base; index < end; index++) {
    if (visited[index - start] === true) continue;
    let low = index;
    let high = index;
    let at = start + (origin[index - start] ?? 0);
    while (at !== index) {
      low = Math.min(low, at);
      high = Math.max(high, at);
      visited[at - start] = true;
      at = start + (origin[at - start] ?? 0);
    }
    buffer.mergeClusters(Math.max(base, low), high + 1);
  }
  return base;
}

function reverse(glyphs: GlyphInfo[], start: number, end: number): void {
  for (let left = start, right = end - 1; left < right; left++, right--) {
    const swap = glyphs[left];
    const other = glyphs[right];
    if (swap === undefined || other === undefined) continue;
    glyphs[left] = other;
    glyphs[right] = swap;
  }
}

function setMasks(
  buffer: ShapingState["buffer"],
  plan: ShapingState["plan"],
  start: number,
  end: number,
  base: number,
): void {
  const glyphs = buffer.glyphs;
  const oldSpec = plan.gsubScript === "deva";
  for (
    let index = start;
    index < end && glyphs[index]?.position === Position.raToBecomeReph;
    index++
  ) {
    buffer.at(index).mask |= plan.mask("rphf");
  }
  let preBase = plan.mask("half");
  if (!oldSpec) preBase |= plan.mask("blwf");
  for (let index = start; index < base; index++) buffer.at(index).mask |= preBase;
  const postBase = plan.mask("blwf") | plan.mask("abvf") | plan.mask("pstf");
  for (let index = base + 1; index < end; index++) buffer.at(index).mask |= postBase;
  if (oldSpec) {
    for (let index = start; index + 1 < base; index++) {
      if (
        is(glyphs[index], Category.Ra) &&
        isHalant(glyphs[index + 1]) &&
        (index + 2 === base || !is(glyphs[index + 2], Category.ZWJ))
      ) {
        buffer.at(index).mask |= plan.mask("blwf");
        buffer.at(index + 1).mask |= plan.mask("blwf");
      }
    }
  }
  for (let index = start + 1; index < end; index++) {
    const current = glyphs[index];
    if (!isJoiner(current)) continue;
    if (!is(current, Category.ZWNJ)) continue;
    // A ZWNJ stops half forms of the consonants before it.
    let before = index;
    do {
      before--;
      buffer.at(before).mask &= ~plan.mask("half");
    } while (before > start && !isConsonant(glyphs[before]));
  }
}

function finalReordering(state: ShapingState): void {
  const { buffer, font } = state;
  const viramaGlyph = font.glyphFor(virama);
  for (const info of buffer.glyphs) {
    if (viramaGlyph !== 0 && info.glyph === viramaGlyph && info.ligated && info.multiplied) {
      info.category = Category.H;
      info.ligated = false;
      info.multiplied = false;
    }
  }
  for (const { start, end, type } of syllableRanges(buffer.glyphs)) {
    if (type === SyllableType.symbol || type === SyllableType.nonIndic) continue;
    finalReorderSyllable(state, start, end);
  }
}

/** Final reordering of one syllable (HarfBuzz final_reordering_syllable_indic, Devanagari settings). */
function finalReorderSyllable({ buffer, plan }: ShapingState, start: number, end: number): void {
  const glyphs = buffer.glyphs;
  let base = start;
  for (; base < end; base++) {
    if ((glyphs[base]?.position ?? 0) >= Position.baseC) {
      if (start < base && (glyphs[base]?.position ?? 0) > Position.baseC) base--;
      break;
    }
  }
  if (base === end && start < base && is(glyphs[base - 1], Category.ZWJ)) base--;
  if (base < end) {
    while (start < base && (is(glyphs[base], Category.N) || isHalant(glyphs[base]))) base--;
  }
  base = reorderPreBaseMatras(buffer, start, end, base);
  reorderReph(buffer, start, end, base);
  const first = glyphs[start];
  if (first?.position === Position.preM) {
    const previous = glyphs[start - 1];
    const wordStart =
      previous === undefined ||
      !(
        isStrong(previous.codePoint) ||
        isNonSpacingMark(previous.codePoint) ||
        isSpacingMark(previous.codePoint) ||
        isFormat(previous.codePoint)
      );
    if (wordStart) first.mask |= plan.mask("init");
  }
}

/** Moves left matras after the last halant before the base that formed no half form. The base afterwards. */
function reorderPreBaseMatras(
  buffer: ShapingState["buffer"],
  start: number,
  end: number,
  base: number,
): number {
  const glyphs = buffer.glyphs;
  if (!(start + 1 < end && start < base)) return base;
  let newPosition = base === end ? base - 2 : base - 1;
  for (;;) {
    while (
      newPosition > start &&
      !(is(glyphs[newPosition], Category.M) || isHalant(glyphs[newPosition]))
    ) {
      newPosition--;
    }
    if (isHalant(glyphs[newPosition]) && glyphs[newPosition]?.position !== Position.preM) {
      if (
        newPosition + 1 < end &&
        is(glyphs[newPosition + 1], Category.ZWJ) &&
        newPosition > start
      ) {
        newPosition--;
        continue;
      }
    } else {
      newPosition = start;
    }
    break;
  }
  if (start < newPosition && glyphs[newPosition]?.position !== Position.preM) {
    for (let index = newPosition; index > start; index--) {
      if (glyphs[index - 1]?.position !== Position.preM) continue;
      const oldPosition = index - 1;
      if (oldPosition < base && base <= newPosition) base--;
      buffer.move(oldPosition, newPosition);
      buffer.mergeClusters(newPosition, Math.min(end, base + 1));
      newPosition--;
    }
  } else {
    for (let index = start; index < base; index++) {
      if (glyphs[index]?.position === Position.preM) {
        buffer.mergeClusters(index, Math.min(end, base + 1));
        break;
      }
    }
  }
  return base;
}

/** Moves a formed reph to its place: after the first halant before the base, else to the end (before post marks). */
function reorderReph(
  buffer: ShapingState["buffer"],
  start: number,
  end: number,
  base: number,
): number {
  const glyphs = buffer.glyphs;
  const first = glyphs[start];
  if (!(
    start + 1 < end &&
    first?.position === Position.raToBecomeReph &&
    first.ligated &&
    !first.multiplied
  )) {
    return base;
  }
  let target = start + 1;
  while (target < base && !isHalant(glyphs[target])) target++;
  if (target < base && isHalant(glyphs[target])) {
    if (target + 1 < base && isJoiner(glyphs[target + 1])) target++;
  } else {
    target = end - 1;
    while (target > start && glyphs[target]?.position === Position.smvd) target--;
    if (isHalant(glyphs[target])) {
      for (let index = base + 1; index < target; index++) {
        if (is(glyphs[index], Category.M)) target--;
      }
    }
  }
  buffer.mergeClusters(start, target + 1);
  buffer.move(start, target);
  if (start < base && base <= target) base--;
  return base;
}

/** The Devanagari shaper (HarfBuzz's Indic shaper with Devanagari's settings: implicit reph before post-base forms). */
export const devanagariShaper: Shaper = {
  scriptTags: ["dev2", "deva"],
  zeroMarks: "none",
  collectFeatures,
  setup,
};
