import type { ApplyContext } from "./ApplyContext.js";
import { applyContext } from "./ContextLookups.js";
import { GlyphClass } from "./Gdef.js";
import { AttachType, type GlyphInfo } from "./GlyphBuffer.js";
import { LookupFlag, type LayoutTable } from "./LayoutTable.js";

/** Bytes of a ValueRecord of `format`: two per field set in its low byte. */
export function valueSize(format: number): number {
  let size = 0;
  for (let bit = format & 0xff; bit !== 0; bit >>= 1) size += (bit & 1) * 2;
  return size;
}

/**
 * GPOS lookup types 1 (single), 2 (pair), 3 (cursive), 4 (mark-to-base), 5 (mark-to-ligature), 6 (mark-to-mark), 7
 * and 8 (context); type 9 (extension) is resolved when the lookup is read. Device tables and anchor points are
 * ignored: they adjust for hinting at a pixel size, and every drawer here scales outlines.
 */
export function applyGposSubtable(
  context: ApplyContext,
  type: number,
  subtable: number,
  index: number,
): number | undefined {
  switch (type) {
    case 1:
      return single(context, subtable, index);
    case 2:
      return pair(context, subtable, index);
    case 3:
      return cursive(context, subtable, index);
    case 4:
      return markToBase(context, subtable, index);
    case 5:
      return markToLigature(context, subtable, index);
    case 6:
      return markToMark(context, subtable, index);
    case 7:
      return applyContext(context, subtable, index, false);
    case 8:
      return applyContext(context, subtable, index, true);
    default:
      return undefined;
  }
}

/** Adds a ValueRecord at `record` to a glyph: placements to its offsets, the x advance to its advance. */
function applyValue(table: LayoutTable, info: GlyphInfo, record: number, format: number): void {
  const reader = table.reader;
  let at = record;
  if ((format & 0x01) !== 0) {
    info.xOffset += reader.i16(at);
    at += 2;
  }
  if ((format & 0x02) !== 0) {
    info.yOffset += reader.i16(at);
    at += 2;
  }
  if ((format & 0x04) !== 0) info.xAdvance += reader.i16(at);
  reader.slice(record, valueSize(format));
}

function coverageIndex(context: ApplyContext, subtable: number, at: number, glyph: number): number {
  return context.table.coverage(subtable + context.table.reader.u16(subtable + at)).index(glyph);
}

function anchor(table: LayoutTable, offset: number): { x: number; y: number } {
  return { x: table.reader.i16(offset + 2), y: table.reader.i16(offset + 4) };
}

function single(context: ApplyContext, subtable: number, index: number): number | undefined {
  const reader = context.table.reader;
  const info = context.buffer.at(index);
  const covered = coverageIndex(context, subtable, 2, info.glyph);
  if (covered < 0) return undefined;
  const format = reader.u16(subtable);
  const valueFormat = reader.u16(subtable + 4);
  if (format === 1) {
    applyValue(context.table, info, subtable + 6, valueFormat);
  } else if (format === 2) {
    if (covered >= reader.u16(subtable + 6)) return undefined;
    applyValue(context.table, info, subtable + 8 + covered * valueSize(valueFormat), valueFormat);
  } else {
    return undefined;
  }
  return index + 1;
}

/**
 * Pair adjustment, formats 1 (glyph pairs) and 2 (class pairs). The second glyph is the next one the lookup sees, so a
 * lookup that ignores marks kerns across them. With a value for the second glyph, the lookup continues after it.
 */
function pair(context: ApplyContext, subtable: number, index: number): number | undefined {
  const table = context.table;
  const reader = table.reader;
  const first = context.buffer.at(index);
  const covered = coverageIndex(context, subtable, 2, first.glyph);
  if (covered < 0) return undefined;
  const format = reader.u16(subtable);
  const format1 = reader.u16(subtable + 4);
  const format2 = reader.u16(subtable + 6);
  const size1 = valueSize(format1);
  const size2 = valueSize(format2);
  const second = context.iterator(false, index).next(index);
  const secondInfo = context.buffer.glyphs[second];
  if (second < 0 || secondInfo === undefined) return undefined;
  let record: number | undefined;
  if (format === 1) {
    if (covered >= reader.u16(subtable + 8)) return undefined;
    const set = subtable + reader.u16(subtable + 10 + covered * 2);
    const recordSize = 2 + size1 + size2;
    const count = reader.u16(set);
    reader.slice(set + 2, count * recordSize);
    let low = 0;
    let high = count - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const at = set + 2 + middle * recordSize;
      const glyph = reader.u16(at);
      if (glyph === secondInfo.glyph) {
        record = at + 2;
        break;
      }
      if (glyph < secondInfo.glyph) low = middle + 1;
      else high = middle - 1;
    }
  } else if (format === 2) {
    const class1 = table.classDef(subtable, reader.u16(subtable + 8)).classOf(first.glyph);
    const class2 = table.classDef(subtable, reader.u16(subtable + 10)).classOf(secondInfo.glyph);
    const class2Count = reader.u16(subtable + 14);
    if (class1 >= reader.u16(subtable + 12) || class2 >= class2Count) return undefined;
    record = subtable + 16 + (class1 * class2Count + class2) * (size1 + size2);
  }
  if (record === undefined) return undefined;
  applyValue(table, first, record, format1);
  applyValue(table, secondInfo, record + size1, format2);
  return format2 === 0 ? second : second + 1;
}

/** Cursive attachment (HarfBuzz CursivePosFormat1): the exit anchor of the previous glyph meets this one's entry. */
function cursive(context: ApplyContext, subtable: number, index: number): number | undefined {
  const table = context.table;
  const reader = table.reader;
  if (reader.u16(subtable) !== 1) return undefined;
  const glyphs = context.buffer.glyphs;
  const current = context.buffer.at(index);
  const count = reader.u16(subtable + 4);
  const covered = coverageIndex(context, subtable, 2, current.glyph);
  if (covered < 0 || covered >= count) return undefined;
  const entry = reader.u16(subtable + 6 + covered * 4);
  if (entry === 0) return undefined;
  const previous = context.iterator(false, index).prev(index);
  const previousInfo = glyphs[previous];
  if (previous < 0 || previousInfo === undefined) return undefined;
  const previousCovered = coverageIndex(context, subtable, 2, previousInfo.glyph);
  if (previousCovered < 0 || previousCovered >= count) return undefined;
  const exit = reader.u16(subtable + 6 + previousCovered * 4 + 2);
  if (exit === 0) return undefined;
  const exitAnchor = anchor(table, subtable + exit);
  const entryAnchor = anchor(table, subtable + entry);
  if (context.rtl) {
    const shift = exitAnchor.x + previousInfo.xOffset;
    previousInfo.xAdvance -= shift;
    previousInfo.xOffset -= shift;
    current.xAdvance = entryAnchor.x + current.xOffset;
  } else {
    previousInfo.xAdvance = exitAnchor.x + previousInfo.xOffset;
    const shift = entryAnchor.x + current.xOffset;
    current.xAdvance -= shift;
    current.xOffset -= shift;
  }
  let child = previous;
  let parent = index;
  let yOffset = entryAnchor.y - exitAnchor.y;
  if ((context.lookupFlag & LookupFlag.rightToLeft) === 0) {
    child = index;
    parent = previous;
    yOffset = -yOffset;
  }
  reverseCursiveChain(glyphs, child, parent);
  const childInfo = context.buffer.at(child);
  const parentInfo = context.buffer.at(parent);
  childInfo.attachType = AttachType.cursive;
  childInfo.attachChain = parent - child;
  childInfo.yOffset = yOffset;
  if (parentInfo.attachChain === -childInfo.attachChain) {
    parentInfo.attachChain = 0;
    parentInfo.yOffset = 0;
  }
  return index + 1;
}

/** Turns an old cursive chain from `start` around so its whole tree hangs on the new parent (bounded walk). */
function reverseCursiveChain(glyphs: GlyphInfo[], start: number, newParent: number): void {
  const path: { at: number; chain: number }[] = [];
  let at = start;
  for (let step = 0; step < 64; step++) {
    const info = glyphs[at];
    if (info === undefined || info.attachChain === 0 || info.attachType !== AttachType.cursive) {
      break;
    }
    const chain = info.attachChain;
    info.attachChain = 0;
    if (at + chain === newParent) break;
    path.push({ at, chain });
    at += chain;
  }
  // Unwound deepest first, as HarfBuzz's recursion does: each link now points the other way.
  for (let step = path.length - 1; step >= 0; step--) {
    const { at: position, chain } = path[step] ?? { at: 0, chain: 0 };
    const info = glyphs[position];
    const next = glyphs[position + chain];
    if (info === undefined || next === undefined) continue;
    next.yOffset = -info.yOffset;
    next.attachChain = -chain;
    next.attachType = AttachType.cursive;
  }
}

/**
 * The glyph a mark at `index` attaches to: the previous glyph that is not a mark, past the trailing parts of a
 * multiple substitution (a mark goes on the first of them).
 */
function baseOf(context: ApplyContext, index: number): number {
  const glyphs = context.buffer.glyphs;
  const iterator = context.iteratorWithFlag(index, LookupFlag.ignoreMarks, -1);
  let from = index;
  for (;;) {
    const at = iterator.prev(from);
    const info = glyphs[at];
    if (at < 0 || info === undefined) return -1;
    const before = glyphs[at - 1];
    if (
      !info.multiplied ||
      info.ligatureComponent === 0 ||
      before === undefined ||
      before.glyphClass === GlyphClass.mark ||
      !before.multiplied ||
      info.ligatureId !== before.ligatureId ||
      info.ligatureComponent !== before.ligatureComponent + 1
    ) {
      return at;
    }
    from = at;
  }
}

/** The class and anchor of a mark from a MarkArray, undefined past its records. */
function markRecord(
  table: LayoutTable,
  markArray: number,
  covered: number,
): { markClass: number; anchor: number } | undefined {
  const reader = table.reader;
  if (covered >= reader.u16(markArray)) return undefined;
  const record = markArray + 2 + covered * 4;
  return { markClass: reader.u16(record), anchor: markArray + reader.u16(record + 2) };
}

/** Moves a mark so its anchor sits on its base's anchor; the offset is resolved against the base later. */
function attach(
  context: ApplyContext,
  mark: number,
  base: number,
  markAnchor: number,
  baseAnchor: number,
): number {
  const info = context.buffer.at(mark);
  const from = anchor(context.table, markAnchor);
  const to = anchor(context.table, baseAnchor);
  info.xOffset = to.x - from.x;
  info.yOffset = to.y - from.y;
  info.attachType = AttachType.mark;
  info.attachChain = base - mark;
  return mark + 1;
}

function markToBase(context: ApplyContext, subtable: number, index: number): number | undefined {
  const table = context.table;
  const reader = table.reader;
  if (reader.u16(subtable) !== 1) return undefined;
  const mark = context.buffer.at(index);
  const markCovered = coverageIndex(context, subtable, 2, mark.glyph);
  if (markCovered < 0) return undefined;
  const base = baseOf(context, index);
  const baseInfo = context.buffer.glyphs[base];
  if (baseInfo === undefined) return undefined;
  const baseCovered = coverageIndex(context, subtable, 4, baseInfo.glyph);
  if (baseCovered < 0) return undefined;
  const classCount = reader.u16(subtable + 6);
  const record = markRecord(table, subtable + reader.u16(subtable + 8), markCovered);
  if (record === undefined || record.markClass >= classCount) return undefined;
  const baseArray = subtable + reader.u16(subtable + 10);
  if (baseCovered >= reader.u16(baseArray)) return undefined;
  const anchorOffset = reader.u16(
    baseArray + 2 + (baseCovered * classCount + record.markClass) * 2,
  );
  if (anchorOffset === 0) return undefined;
  return attach(context, index, base, record.anchor, baseArray + anchorOffset);
}

function markToLigature(
  context: ApplyContext,
  subtable: number,
  index: number,
): number | undefined {
  const table = context.table;
  const reader = table.reader;
  if (reader.u16(subtable) !== 1) return undefined;
  const mark = context.buffer.at(index);
  const markCovered = coverageIndex(context, subtable, 2, mark.glyph);
  if (markCovered < 0) return undefined;
  const ligature = context.iteratorWithFlag(index, LookupFlag.ignoreMarks, -1).prev(index);
  const ligatureInfo = context.buffer.glyphs[ligature];
  if (ligatureInfo === undefined) return undefined;
  const ligatureCovered = coverageIndex(context, subtable, 4, ligatureInfo.glyph);
  if (ligatureCovered < 0) return undefined;
  const classCount = reader.u16(subtable + 6);
  const record = markRecord(table, subtable + reader.u16(subtable + 8), markCovered);
  if (record === undefined || record.markClass >= classCount) return undefined;
  const ligatureArray = subtable + reader.u16(subtable + 10);
  if (ligatureCovered >= reader.u16(ligatureArray)) return undefined;
  const ligatureAttach = ligatureArray + reader.u16(ligatureArray + 2 + ligatureCovered * 2);
  const components = reader.u16(ligatureAttach);
  if (components === 0) return undefined;
  const component =
    ligatureInfo.ligatureId !== 0 &&
    ligatureInfo.ligatureId === mark.ligatureId &&
    mark.ligatureComponent > 0
      ? Math.min(components, mark.ligatureComponent) - 1
      : components - 1;
  const anchorOffset = reader.u16(
    ligatureAttach + 2 + (component * classCount + record.markClass) * 2,
  );
  if (anchorOffset === 0) return undefined;
  return attach(context, index, ligature, record.anchor, ligatureAttach + anchorOffset);
}

function markToMark(context: ApplyContext, subtable: number, index: number): number | undefined {
  const table = context.table;
  const reader = table.reader;
  if (reader.u16(subtable) !== 1) return undefined;
  const mark = context.buffer.at(index);
  const markCovered = coverageIndex(context, subtable, 2, mark.glyph);
  if (markCovered < 0) return undefined;
  const flag =
    context.lookupFlag &
    ~(LookupFlag.ignoreBaseGlyphs | LookupFlag.ignoreLigatures | LookupFlag.ignoreMarks);
  const previous = context.iteratorWithFlag(index, flag, context.markFilteringSet).prev(index);
  const previousInfo = context.buffer.glyphs[previous];
  if (previousInfo?.glyphClass !== GlyphClass.mark) return undefined;
  const sameBase =
    mark.ligatureId === previousInfo.ligatureId
      ? mark.ligatureId === 0 || mark.ligatureComponent === previousInfo.ligatureComponent
      : (mark.ligatureId > 0 && mark.ligatureComponent === 0) ||
        (previousInfo.ligatureId > 0 && previousInfo.ligatureComponent === 0);
  if (!sameBase) return undefined;
  const previousCovered = coverageIndex(context, subtable, 4, previousInfo.glyph);
  if (previousCovered < 0) return undefined;
  const classCount = reader.u16(subtable + 6);
  const record = markRecord(table, subtable + reader.u16(subtable + 8), markCovered);
  if (record === undefined || record.markClass >= classCount) return undefined;
  const mark2Array = subtable + reader.u16(subtable + 10);
  if (previousCovered >= reader.u16(mark2Array)) return undefined;
  const anchorOffset = reader.u16(
    mark2Array + 2 + (previousCovered * classCount + record.markClass) * 2,
  );
  if (anchorOffset === 0) return undefined;
  return attach(context, index, previous, record.anchor, mark2Array + anchorOffset);
}
