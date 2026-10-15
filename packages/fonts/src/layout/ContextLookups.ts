import { MalformedFont } from "../MalformedFont.js";
import type { ApplyContext } from "./ApplyContext.js";
import { GlyphClass } from "./Gdef.js";
import type { GlyphInfo } from "./GlyphBuffer.js";
import { maxSequence } from "./ShapingBudget.js";

/** The input glyphs a rule or ligature matched: their positions and how many ligature components they hold. */
export interface InputMatch {
  readonly positions: number[];
  readonly end: number;
  readonly components: number;
}

/** Compares a glyph with the value a rule names at sequence position `index`. */
type Matcher = (info: GlyphInfo, value: number) => boolean;

/** Where a rule's sequences lie: values are glyphs, classes or Coverage offsets depending on the format. */
interface Rule {
  readonly backtrack: number;
  readonly backtrackCount: number;
  /** Offset of the value of input position 1 (formats 1, 2) or 0 (format 3). */
  readonly input: number;
  readonly inputCount: number;
  readonly lookahead: number;
  readonly lookaheadCount: number;
  readonly records: number;
  readonly recordCount: number;
}

/** Components of a glyph for ligature bookkeeping: a ligature's own count, 1 for anything else. */
export function componentsOf(info: GlyphInfo): number {
  return info.glyphClass === GlyphClass.ligature && info.ligatureComponents > 0
    ? info.ligatureComponents
    : 1;
}

function checkSequence(count: number): void {
  if (count > maxSequence) {
    throw new MalformedFont(`font layout rule names ${String(count)} glyphs (at most 64)`);
  }
}

/**
 * Matches the input glyphs 1..count-1 after the one at `start` (HarfBuzz match_input): never across glyphs attached
 * to different components of an earlier ligature.
 */
export function matchInput(
  context: ApplyContext,
  start: number,
  count: number,
  matches: (info: GlyphInfo, position: number) => boolean,
): InputMatch | undefined {
  checkSequence(count);
  const glyphs = context.buffer.glyphs;
  const first = glyphs[start];
  if (first === undefined) return undefined;
  const iterator = context.iterator(false, start);
  const positions = [start];
  let components = componentsOf(first);
  let at = start;
  for (let position = 1; position < count; position++) {
    at = iterator.next(at, (info) => matches(info, position));
    const info = glyphs[at];
    if (at < 0 || info === undefined) return undefined;
    if (first.ligatureId !== 0 && first.ligatureComponent !== 0) {
      if (
        first.ligatureId !== info.ligatureId ||
        first.ligatureComponent !== info.ligatureComponent
      ) {
        return undefined;
      }
    } else if (
      info.ligatureId !== 0 &&
      info.ligatureComponent !== 0 &&
      info.ligatureId !== first.ligatureId
    ) {
      return undefined;
    }
    positions.push(at);
    components += componentsOf(info);
  }
  return { positions, end: at + 1, components };
}

/** Whether the `count` glyphs before `start` match, nearest first. */
export function matchBacktrack(
  context: ApplyContext,
  start: number,
  count: number,
  matches: (info: GlyphInfo, position: number) => boolean,
): boolean {
  checkSequence(count);
  const iterator = context.iterator(true, start);
  let at = start;
  for (let position = 0; position < count; position++) {
    at = iterator.prev(at, (info) => matches(info, position));
    if (at < 0) return false;
  }
  return true;
}

/** Whether the `count` glyphs after `last` match. */
export function matchLookahead(
  context: ApplyContext,
  start: number,
  last: number,
  count: number,
  matches: (info: GlyphInfo, position: number) => boolean,
): boolean {
  checkSequence(count);
  const iterator = context.iterator(true, start);
  let at = last;
  for (let position = 0; position < count; position++) {
    at = iterator.next(at, (info) => matches(info, position));
    if (at < 0) return false;
  }
  return true;
}

/**
 * GSUB 5/6 and GPOS 7/8: sequence context and chained sequence context, formats 1 (glyphs), 2 (classes) and 3
 * (coverages). The first rule that matches applies its nested lookups; the lookup continues after its input.
 */
export function applyContext(
  context: ApplyContext,
  subtable: number,
  index: number,
  chained: boolean,
): number | undefined {
  const table = context.table;
  const reader = table.reader;
  const format = reader.u16(subtable);
  const glyph = context.buffer.at(index).glyph;
  if (format === 3) {
    const rule = formatThreeRule(context, subtable, chained);
    const matcher: Matcher = (info, value) =>
      table.coverage(subtable + value).index(info.glyph) >= 0;
    if (rule.inputCount === 0 || !matcher(context.buffer.at(index), reader.u16(rule.input))) {
      return undefined;
    }
    return applyRule(context, index, rule, [matcher, matcher, matcher], true);
  }
  if (format !== 1 && format !== 2) return undefined;
  if (table.coverage(subtable + reader.u16(subtable + 2)).index(glyph) < 0) return undefined;
  let matchers: [Matcher, Matcher, Matcher];
  let setIndex: number;
  let sets: number;
  if (format === 1) {
    const sameGlyph: Matcher = (info, value) => info.glyph === value;
    matchers = [sameGlyph, sameGlyph, sameGlyph];
    setIndex = table.coverage(subtable + reader.u16(subtable + 2)).index(glyph);
    sets = subtable + 4;
  } else if (chained) {
    const backtrack = table.classDef(subtable, reader.u16(subtable + 4));
    const input = table.classDef(subtable, reader.u16(subtable + 6));
    const lookahead = table.classDef(subtable, reader.u16(subtable + 8));
    matchers = [
      (info, value) => backtrack.classOf(info.glyph) === value,
      (info, value) => input.classOf(info.glyph) === value,
      (info, value) => lookahead.classOf(info.glyph) === value,
    ];
    setIndex = input.classOf(glyph);
    sets = subtable + 10;
  } else {
    const classes = table.classDef(subtable, reader.u16(subtable + 4));
    const sameClass: Matcher = (info, value) => classes.classOf(info.glyph) === value;
    matchers = [sameClass, sameClass, sameClass];
    setIndex = classes.classOf(glyph);
    sets = subtable + 6;
  }
  if (setIndex >= reader.u16(sets)) return undefined;
  const setOffset = reader.u16(sets + 2 + setIndex * 2);
  if (setOffset === 0) return undefined;
  const set = subtable + setOffset;
  const ruleCount = reader.u16(set);
  reader.slice(set + 2, ruleCount * 2);
  for (let position = 0; position < ruleCount; position++) {
    context.buffer.budget.charge();
    const rule = formatOneTwoRule(context, set + reader.u16(set + 2 + position * 2), chained);
    const next = applyRule(context, index, rule, matchers, false);
    if (next !== undefined) return next;
  }
  return undefined;
}

function formatOneTwoRule(context: ApplyContext, rule: number, chained: boolean): Rule {
  const reader = context.table.reader;
  if (!chained) {
    const inputCount = reader.u16(rule);
    const recordCount = reader.u16(rule + 2);
    const input = rule + 4;
    return {
      backtrack: 0,
      backtrackCount: 0,
      input,
      inputCount,
      lookahead: 0,
      lookaheadCount: 0,
      records: input + Math.max(0, inputCount - 1) * 2,
      recordCount,
    };
  }
  const backtrackCount = reader.u16(rule);
  const inputAt = rule + 2 + backtrackCount * 2;
  const inputCount = reader.u16(inputAt);
  const lookaheadAt = inputAt + 2 + Math.max(0, inputCount - 1) * 2;
  const lookaheadCount = reader.u16(lookaheadAt);
  const recordsAt = lookaheadAt + 2 + lookaheadCount * 2;
  return {
    backtrack: rule + 2,
    backtrackCount,
    input: inputAt + 2,
    inputCount,
    lookahead: lookaheadAt + 2,
    lookaheadCount,
    records: recordsAt + 2,
    recordCount: reader.u16(recordsAt),
  };
}

function formatThreeRule(context: ApplyContext, subtable: number, chained: boolean): Rule {
  const reader = context.table.reader;
  if (!chained) {
    const inputCount = reader.u16(subtable + 2);
    return {
      backtrack: 0,
      backtrackCount: 0,
      input: subtable + 6,
      inputCount,
      lookahead: 0,
      lookaheadCount: 0,
      records: subtable + 6 + inputCount * 2,
      recordCount: reader.u16(subtable + 4),
    };
  }
  const backtrackCount = reader.u16(subtable + 2);
  const inputAt = subtable + 4 + backtrackCount * 2;
  const inputCount = reader.u16(inputAt);
  const lookaheadAt = inputAt + 2 + inputCount * 2;
  const lookaheadCount = reader.u16(lookaheadAt);
  const recordsAt = lookaheadAt + 2 + lookaheadCount * 2;
  return {
    backtrack: subtable + 4,
    backtrackCount,
    input: inputAt + 2,
    inputCount,
    lookahead: lookaheadAt + 2,
    lookaheadCount,
    records: recordsAt + 2,
    recordCount: reader.u16(recordsAt),
  };
}

/** Matches a rule at `index` and applies its lookups; the index the lookup continues at, undefined without a match. */
function applyRule(
  context: ApplyContext,
  index: number,
  rule: Rule,
  [backtrack, input, lookahead]: [Matcher, Matcher, Matcher],
  inputIncludesFirst: boolean,
): number | undefined {
  const reader = context.table.reader;
  if (rule.inputCount === 0) return undefined;
  checkSequence(rule.backtrackCount);
  checkSequence(rule.lookaheadCount);
  reader.slice(rule.records, rule.recordCount * 4);
  const inputValue = (position: number) =>
    reader.u16(rule.input + (inputIncludesFirst ? position : position - 1) * 2);
  const matched = matchInput(context, index, rule.inputCount, (info, position) =>
    input(info, inputValue(position)),
  );
  if (matched === undefined) return undefined;
  const backtrackMatches = matchBacktrack(context, index, rule.backtrackCount, (info, position) =>
    backtrack(info, reader.u16(rule.backtrack + position * 2)),
  );
  if (!backtrackMatches) return undefined;
  const last = matched.positions[matched.positions.length - 1] ?? index;
  const lookaheadMatches = matchLookahead(
    context,
    index,
    last,
    rule.lookaheadCount,
    (info, position) => lookahead(info, reader.u16(rule.lookahead + position * 2)),
  );
  if (!lookaheadMatches) return undefined;
  return applyRecords(context, matched.positions, matched.end, rule.records, rule.recordCount);
}

/**
 * The nested lookups of a matched rule, each at its sequence index, the match positions moved as lookups change the
 * buffer's length (HarfBuzz apply_lookup). The index after the (possibly grown or shrunk) input.
 */
function applyRecords(
  context: ApplyContext,
  matched: readonly number[],
  matchEnd: number,
  records: number,
  recordCount: number,
): number {
  const reader = context.table.reader;
  const positions = [...matched];
  let count = positions.length;
  let end = matchEnd;
  for (let record = 0; record < recordCount; record++) {
    context.buffer.budget.charge();
    const sequenceIndex = reader.u16(records + record * 4);
    const lookupIndex = reader.u16(records + record * 4 + 2);
    if (sequenceIndex >= count) continue;
    const before = context.buffer.length;
    const at = positions[sequenceIndex] ?? 0;
    if (!context.applyNested(lookupIndex, at)) continue;
    let delta = context.buffer.length - before;
    if (delta === 0) continue;
    end += delta;
    if (end < at) {
      delta += at - end;
      end = at;
    }
    let next = sequenceIndex + 1;
    if (delta > 0 && count + delta > maxSequence) break;
    if (delta < 0) {
      delta = Math.max(delta, next - count);
      next -= delta;
    }
    // Entries from `next` move by `delta`; new entries after sequenceIndex follow the substituted glyph.
    const tail = positions.slice(next, count).map((position) => position + delta);
    const head = positions.slice(0, sequenceIndex + 1);
    for (let added = sequenceIndex + 1; added < next + delta; added++) {
      head.push((head[head.length - 1] ?? at) + 1);
    }
    positions.length = 0;
    positions.push(...head, ...tail);
    count = positions.length;
  }
  return end;
}
