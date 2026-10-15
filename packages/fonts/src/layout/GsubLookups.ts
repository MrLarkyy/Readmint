import { MalformedFont } from "../MalformedFont.js";
import type { ApplyContext } from "./ApplyContext.js";
import {
  applyContext,
  componentsOf,
  matchBacktrack,
  matchInput,
  matchLookahead,
} from "./ContextLookups.js";
import { GlyphClass } from "./Gdef.js";
import type { GlyphInfo } from "./GlyphBuffer.js";
import type { LayoutTable } from "./LayoutTable.js";
import { maxSequence } from "./ShapingBudget.js";

/**
 * GSUB lookup types 1 (single), 2 (multiple), 3 (alternate: the first one), 4 (ligature), 5 and 6 (context), 8
 * (reverse chaining single); type 7 (extension) is resolved when the lookup is read.
 */
export function applyGsubSubtable(
  context: ApplyContext,
  type: number,
  subtable: number,
  index: number,
): number | undefined {
  switch (type) {
    case 1:
      return single(context, subtable, index);
    case 2:
      return multiple(context, subtable, index);
    case 3:
      return alternate(context, subtable, index);
    case 4:
      return ligature(context, subtable, index);
    case 5:
      return applyContext(context, subtable, index, false);
    case 6:
      return applyContext(context, subtable, index, true);
    case 8:
      return reverseChaining(context, subtable, index);
    default:
      return undefined;
  }
}

/**
 * Whether the lookups would replace exactly this glyph sequence, without context (HarfBuzz would_substitute): the
 * Indic shaper asks it to learn which consonants take below-base, post-base or reph forms.
 */
export function wouldSubstitute(
  table: LayoutTable,
  lookups: readonly number[],
  glyphs: readonly number[],
): boolean {
  const first = glyphs[0];
  if (first === undefined) return false;
  for (const index of lookups) {
    const lookup = table.lookup(index);
    if (lookup === undefined || !lookup.digest.mayHave(first)) continue;
    for (const subtable of lookup.subtables) {
      if (wouldApply(table, lookup.type, subtable, glyphs)) return true;
    }
  }
  return false;
}

function wouldApply(
  table: LayoutTable,
  type: number,
  subtable: number,
  glyphs: readonly number[],
): boolean {
  const reader = table.reader;
  const first = glyphs[0] ?? 0;
  const format = reader.u16(subtable);
  if (type >= 1 && type <= 3) {
    return glyphs.length === 1 && coverageIndex(table, subtable, first) >= 0;
  }
  if (type !== 4 || format !== 1) return false;
  const covered = coverageIndex(table, subtable, first);
  if (covered < 0 || covered >= reader.u16(subtable + 4)) return false;
  const set = subtable + reader.u16(subtable + 6 + covered * 2);
  const count = reader.u16(set);
  for (let position = 0; position < Math.min(count, maxSequence); position++) {
    const ligatureAt = set + reader.u16(set + 2 + position * 2);
    if (reader.u16(ligatureAt + 2) !== glyphs.length) continue;
    let same = true;
    for (let component = 1; component < glyphs.length && same; component++) {
      same = reader.u16(ligatureAt + 4 + (component - 1) * 2) === glyphs[component];
    }
    if (same) return true;
  }
  return false;
}

function coverageIndex(table: LayoutTable, subtable: number, glyph: number): number {
  return table.coverage(subtable + table.reader.u16(subtable + 2)).index(glyph);
}

function single(context: ApplyContext, subtable: number, index: number): number | undefined {
  const reader = context.table.reader;
  const info = context.buffer.at(index);
  const covered = coverageIndex(context.table, subtable, info.glyph);
  if (covered < 0) return undefined;
  const format = reader.u16(subtable);
  let glyph: number;
  if (format === 1) {
    glyph = (info.glyph + reader.i16(subtable + 4)) & 0xffff;
  } else if (format === 2) {
    if (covered >= reader.u16(subtable + 4)) return undefined;
    glyph = reader.u16(subtable + 6 + covered * 2);
  } else {
    return undefined;
  }
  context.substitute(info, glyph);
  return index + 1;
}

function multiple(context: ApplyContext, subtable: number, index: number): number | undefined {
  const reader = context.table.reader;
  const info = context.buffer.at(index);
  const covered = coverageIndex(context.table, subtable, info.glyph);
  if (covered < 0 || reader.u16(subtable) !== 1 || covered >= reader.u16(subtable + 4)) {
    return undefined;
  }
  const sequence = subtable + reader.u16(subtable + 6 + covered * 2);
  const count = reader.u16(sequence);
  const substitutes = reader.slice(sequence + 2, count * 2);
  if (count === 1) {
    context.substitute(info, reader.u16(sequence + 2));
    return index + 1;
  }
  if (count === 0) {
    // The spec disallows an empty sequence; Uniscribe and HarfBuzz delete the glyph.
    context.buffer.splice(index, 1, []);
    return index;
  }
  context.buffer.budget.charge(count);
  const guess = info.glyphClass === GlyphClass.ligature ? GlyphClass.base : undefined;
  const outputs: GlyphInfo[] = [];
  for (let position = 0; position < count; position++) {
    const output: GlyphInfo = { ...info };
    if (info.ligatureId === 0) {
      output.ligatureId = 0;
      output.ligatureComponent = position & 0x0f;
      output.ligatureComponents = 0;
    }
    const glyph = ((substitutes[position * 2] ?? 0) << 8) | (substitutes[position * 2 + 1] ?? 0);
    context.substitute(output, glyph, {
      component: true,
      ...(guess === undefined ? {} : { guess }),
    });
    outputs.push(output);
  }
  context.buffer.splice(index, 1, outputs);
  return index + count;
}

function alternate(context: ApplyContext, subtable: number, index: number): number | undefined {
  const reader = context.table.reader;
  const info = context.buffer.at(index);
  const covered = coverageIndex(context.table, subtable, info.glyph);
  if (covered < 0 || reader.u16(subtable) !== 1 || covered >= reader.u16(subtable + 4)) {
    return undefined;
  }
  const set = subtable + reader.u16(subtable + 6 + covered * 2);
  if (reader.u16(set) === 0) return undefined;
  context.substitute(info, reader.u16(set + 2));
  return index + 1;
}

function ligature(context: ApplyContext, subtable: number, index: number): number | undefined {
  const reader = context.table.reader;
  const info = context.buffer.at(index);
  const covered = coverageIndex(context.table, subtable, info.glyph);
  if (covered < 0 || reader.u16(subtable) !== 1 || covered >= reader.u16(subtable + 4)) {
    return undefined;
  }
  const set = subtable + reader.u16(subtable + 6 + covered * 2);
  const count = reader.u16(set);
  reader.slice(set + 2, count * 2);
  for (let position = 0; position < count; position++) {
    context.buffer.budget.charge();
    const ligatureAt = set + reader.u16(set + 2 + position * 2);
    const glyph = reader.u16(ligatureAt);
    const components = reader.u16(ligatureAt + 2);
    if (components === 0) continue;
    if (components > maxSequence) {
      throw new MalformedFont(
        `font ligature has ${String(components)} components (at most ${String(maxSequence)})`,
      );
    }
    if (components === 1) {
      context.substitute(info, glyph, { ligature: true });
      return index + 1;
    }
    reader.slice(ligatureAt + 4, (components - 1) * 2);
    const matched = matchInput(
      context,
      index,
      components,
      (candidate, component) =>
        candidate.glyph === reader.u16(ligatureAt + 4 + (component - 1) * 2),
    );
    if (matched === undefined) continue;
    ligate(context, matched.positions, matched.end, matched.components, glyph);
    return index + 1;
  }
  return undefined;
}

/**
 * Puts the ligature glyph at the first matched position and removes the other components; marks skipped between
 * components stay and are re-pointed at the ligature's components (HarfBuzz ligate_input). A base followed only by
 * marks stays a base, marks ligating together stay marks of their old ligature.
 */
function ligate(
  context: ApplyContext,
  positions: readonly number[],
  end: number,
  totalComponents: number,
  glyph: number,
): void {
  const buffer = context.buffer;
  const glyphs = buffer.glyphs;
  const first = buffer.at(positions[0] ?? 0);
  const rest = positions.slice(1).map((position) => buffer.at(position));
  const allMarks = rest.every((info) => info.glyphClass === GlyphClass.mark);
  const baseLigature = first.glyphClass === GlyphClass.base && allMarks;
  const markLigature = first.glyphClass === GlyphClass.mark && allMarks;
  const isLigature = !baseLigature && !markLigature;
  buffer.mergeClusters(positions[0] ?? 0, end);
  const ligatureId = isLigature ? context.allocateLigatureId() : 0;
  let lastLigatureId = first.ligatureId;
  let lastComponents = componentsOf(first);
  let componentsSoFar = lastComponents;
  if (isLigature) {
    first.ligatureId = ligatureId;
    first.ligatureComponent = 0;
    first.ligatureComponents = totalComponents & 0x0f;
  }
  context.substitute(first, glyph, {
    ligature: true,
    ...(isLigature ? { guess: GlyphClass.ligature } : {}),
  });
  for (let component = 1; component < positions.length; component++) {
    const position = positions[component] ?? 0;
    for (let between = (positions[component - 1] ?? 0) + 1; between < position; between++) {
      const mark = glyphs[between];
      if (!isLigature || mark === undefined) continue;
      const own = mark.ligatureComponent === 0 ? lastComponents : mark.ligatureComponent;
      mark.ligatureId = ligatureId;
      mark.ligatureComponent =
        (componentsSoFar - lastComponents + Math.min(own, lastComponents)) & 0x0f;
    }
    const info = buffer.at(position);
    lastLigatureId = info.ligatureId;
    lastComponents = componentsOf(info);
    componentsSoFar += lastComponents;
  }
  const last = positions[positions.length - 1] ?? 0;
  if (!markLigature && lastLigatureId !== 0) {
    for (let following = last + 1; following < glyphs.length; following++) {
      const mark = glyphs[following];
      if (mark?.ligatureId !== lastLigatureId || mark.ligatureComponent === 0) break;
      mark.ligatureId = ligatureId;
      mark.ligatureComponent =
        (componentsSoFar - lastComponents + Math.min(mark.ligatureComponent, lastComponents)) &
        0x0f;
    }
  }
  for (let component = positions.length - 1; component >= 1; component--) {
    buffer.splice(positions[component] ?? 0, 1, []);
  }
}

function reverseChaining(
  context: ApplyContext,
  subtable: number,
  index: number,
): number | undefined {
  const table = context.table;
  const reader = table.reader;
  const info = context.buffer.at(index);
  if (reader.u16(subtable) !== 1) return undefined;
  const covered = coverageIndex(table, subtable, info.glyph);
  if (covered < 0) return undefined;
  const backtrackCount = reader.u16(subtable + 4);
  const lookaheadAt = subtable + 6 + backtrackCount * 2;
  const lookaheadCount = reader.u16(lookaheadAt);
  const substitutesAt = lookaheadAt + 2 + lookaheadCount * 2;
  if (covered >= reader.u16(substitutesAt)) return undefined;
  const covers = (offsetAt: number) => (candidate: GlyphInfo, position: number) =>
    table.coverage(subtable + reader.u16(offsetAt + position * 2)).index(candidate.glyph) >= 0;
  if (!matchBacktrack(context, index, backtrackCount, covers(subtable + 6))) return undefined;
  if (!matchLookahead(context, index, index, lookaheadCount, covers(lookaheadAt + 2))) {
    return undefined;
  }
  context.substitute(info, reader.u16(substitutesAt + 2 + covered * 2));
  return index - 1;
}
