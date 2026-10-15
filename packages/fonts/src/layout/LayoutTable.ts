import { MalformedFont } from "../MalformedFont.js";
import type { SfntReader } from "../SfntReader.js";
import { ClassDef } from "./ClassDef.js";
import { Coverage } from "./Coverage.js";
import { LookupDigest } from "./LookupDigest.js";

/** Lookups one GSUB or GPOS table may hold; large real fonts use a few hundred. */
export const maxLookups = 1024;
/** Subtables one lookup may hold (the same cap kerning had since RM-14). */
export const maxSubtables = 64;
/** Lookup indices read over all features of one selection together, repeats included. */
export const maxLookupReads = 4096;

/** A lookup: its type with an extension resolved, its flag and the absolute offsets of its subtables. */
export interface Lookup {
  readonly index: number;
  readonly type: number;
  readonly flag: number;
  /** GDEF mark glyph set of the UseMarkFilteringSet flag, -1 without it. */
  readonly markFilteringSet: number;
  readonly subtables: readonly number[];
  /** The glyphs a subtable can start on. */
  readonly digest: LookupDigest;
}

/** The lookups each wanted feature names, and the required feature's (tag ""). */
export type FeatureLookups = ReadonlyMap<string, readonly number[]>;

export const LookupFlag = {
  rightToLeft: 0x0001,
  ignoreBaseGlyphs: 0x0002,
  ignoreLigatures: 0x0004,
  ignoreMarks: 0x0008,
  useMarkFilteringSet: 0x0010,
  markAttachmentType: 0xff00,
} as const;

/**
 * A GSUB or GPOS table: script and feature selection, and lookups parsed on first use (with their Coverage and
 * ClassDef tables, cached by offset). Every cap is count-based, so a hostile table fails the same way everywhere.
 */
export class LayoutTable {
  readonly lookupCount: number;
  private readonly scriptList: number;
  private readonly featureList: number;
  private readonly lookupList: number;
  private readonly lookups = new Map<number, Lookup>();
  private readonly coverages = new Map<number, Coverage>();
  private readonly coverageDigests = new Map<number, LookupDigest>();
  private readonly classDefs = new Map<number, ClassDef>();
  private readonly selections = new Map<string, FeatureLookups>();
  /** Coverage entries read to build digests; each Coverage table is read once. */
  private digestWork = 0;

  constructor(
    readonly reader: SfntReader,
    readonly kind: "GSUB" | "GPOS",
  ) {
    const usable = reader.length >= 10 && reader.u16(0) === 1;
    this.scriptList = usable ? reader.u16(4) : 0;
    this.featureList = usable ? reader.u16(6) : 0;
    this.lookupList = usable ? reader.u16(8) : 0;
    this.lookupCount = this.lookupList === 0 ? 0 : reader.u16(this.lookupList);
    if (this.lookupCount > maxLookups) {
      throw new MalformedFont(
        `font ${kind} has ${String(this.lookupCount)} lookups (at most ${String(maxLookups)})`,
      );
    }
    reader.slice(this.lookupList + 2, this.lookupCount * 2);
  }

  /** The type of an extension lookup in this table. */
  get extensionType(): number {
    return this.kind === "GSUB" ? 7 : 9;
  }

  /** Whether the table lists script `tag`. */
  hasScript(tag: string): boolean {
    return this.scriptOffset(tag) !== undefined;
  }

  /**
   * The lookups of the `wanted` features under the default LangSys of the first of `scriptTags` the table lists,
   * else DFLT, dflt or latn; each sorted and without repeats. Every feature index is visited once however often the
   * LangSys lists it, and the lookup lists read hold at most `maxLookupReads` entries together.
   */
  selectFeatures(scriptTags: readonly string[], wanted: readonly string[]): FeatureLookups {
    const key = `${scriptTags.join(",")}|${wanted.join(",")}`;
    let selection = this.selections.get(key);
    if (selection === undefined) {
      selection = this.select(scriptTags, new Set(wanted));
      this.selections.set(key, selection);
    }
    return selection;
  }

  /** The lookup at `index`, undefined past the lookup list. */
  lookup(index: number): Lookup | undefined {
    if (index >= this.lookupCount) return undefined;
    let lookup = this.lookups.get(index);
    if (lookup === undefined) {
      lookup = this.readLookup(index);
      this.lookups.set(index, lookup);
    }
    return lookup;
  }

  coverage(offset: number): Coverage {
    let coverage = this.coverages.get(offset);
    if (coverage === undefined) {
      coverage = Coverage.read(this.reader, offset);
      this.coverages.set(offset, coverage);
    }
    return coverage;
  }

  /** A ClassDef at an absolute offset; `base` itself (a null offset) is the empty one. */
  classDef(base: number, offset: number): ClassDef {
    if (offset === 0) return ClassDef.empty;
    const at = base + offset;
    let classDef = this.classDefs.get(at);
    if (classDef === undefined) {
      classDef = ClassDef.read(this.reader, at);
      this.classDefs.set(at, classDef);
    }
    return classDef;
  }

  private select(scriptTags: readonly string[], wanted: ReadonlySet<string>): FeatureLookups {
    const result = new Map<string, number[]>();
    let script: number | undefined;
    for (const tag of [...scriptTags, "DFLT", "dflt", "latn"]) {
      script = this.scriptOffset(tag);
      if (script !== undefined) break;
    }
    if (script === undefined) return result;
    const langSysOffset = this.reader.u16(script);
    if (langSysOffset === 0) return result;
    const langSys = script + langSysOffset;
    const featureCount = this.reader.u16(this.featureList);
    const features = new Map<number, string>();
    const required = this.reader.u16(langSys + 2);
    if (required < featureCount) features.set(required, "");
    for (const feature of this.u16List(langSys + 4)) {
      if (feature >= featureCount || features.has(feature)) continue;
      const tag = this.reader.tag(this.featureList + 2 + feature * 6);
      if (wanted.has(tag)) features.set(feature, tag);
    }
    let reads = 0;
    const collected = new Map<string, Set<number>>();
    for (const feature of [...features.keys()].sort((left, right) => left - right)) {
      const tag = features.get(feature) ?? "";
      const table = this.featureList + this.reader.u16(this.featureList + 2 + feature * 6 + 4);
      reads += this.reader.u16(table + 2);
      if (reads > maxLookupReads) {
        throw new MalformedFont(`font ${this.kind} features list too many lookups`);
      }
      let lookups = collected.get(tag);
      if (lookups === undefined) {
        lookups = new Set();
        collected.set(tag, lookups);
      }
      for (const lookup of this.u16List(table + 2)) {
        if (lookup < this.lookupCount) lookups.add(lookup);
      }
    }
    for (const [tag, lookups] of collected) {
      result.set(
        tag,
        [...lookups].sort((left, right) => left - right),
      );
    }
    return result;
  }

  private scriptOffset(tag: string): number | undefined {
    if (this.scriptList === 0) return undefined;
    const count = this.reader.u16(this.scriptList);
    this.reader.slice(this.scriptList + 2, count * 6);
    for (let index = 0; index < count; index++) {
      const record = this.scriptList + 2 + index * 6;
      if (this.reader.tag(record) === tag) return this.scriptList + this.reader.u16(record + 4);
    }
    return undefined;
  }

  /** A u16 count at `offset` followed by that many u16 values; the whole list must lie inside the table. */
  private u16List(offset: number): number[] {
    const count = this.reader.u16(offset);
    const values = this.reader.slice(offset + 2, count * 2);
    const list: number[] = [];
    for (let index = 0; index < count; index++) {
      list.push(((values[index * 2] ?? 0) << 8) | (values[index * 2 + 1] ?? 0));
    }
    return list;
  }

  private readLookup(index: number): Lookup {
    const reader = this.reader;
    const offset = this.lookupList + reader.u16(this.lookupList + 2 + index * 2);
    let type = reader.u16(offset);
    const flag = reader.u16(offset + 2);
    const count = reader.u16(offset + 4);
    if (count > maxSubtables) {
      throw new MalformedFont(`font ${this.kind} lookup ${String(index)} has too many subtables`);
    }
    let subtables: number[] = [];
    for (let position = 0; position < count; position++) {
      subtables.push(offset + reader.u16(offset + 6 + position * 2));
    }
    const markFilteringSet =
      (flag & LookupFlag.useMarkFilteringSet) !== 0 ? reader.u16(offset + 6 + count * 2) : -1;
    if (type === this.extensionType) {
      const resolved = this.resolveExtensions(index, subtables);
      type = resolved.type;
      subtables = resolved.subtables;
    }
    const digest = new LookupDigest();
    for (const subtable of subtables) {
      const coverage = this.firstCoverage(type, subtable);
      if (coverage !== undefined) digest.merge(this.coverageDigest(coverage));
    }
    return { index, type, flag, markFilteringSet, subtables, digest };
  }

  /** Extension subtables replaced by what they point to; an extension of an extension is malformed. */
  private resolveExtensions(
    index: number,
    subtables: readonly number[],
  ): { type: number; subtables: number[] } {
    let type = 0;
    const resolved: number[] = [];
    for (const subtable of subtables) {
      if (this.reader.u16(subtable) !== 1) continue;
      const inner = this.reader.u16(subtable + 2);
      if (inner === this.extensionType) {
        throw new MalformedFont(
          `font ${this.kind} lookup ${String(index)} is an extension of an extension`,
        );
      }
      if (type !== 0 && inner !== type) {
        throw new MalformedFont(
          `font ${this.kind} lookup ${String(index)} mixes extension subtable types`,
        );
      }
      type = inner;
      resolved.push(subtable + this.reader.u32(subtable + 4));
    }
    return { type, subtables: resolved };
  }

  /** The Coverage of the first glyph a subtable matches, undefined for a subtable that can never apply. */
  private firstCoverage(type: number, subtable: number): number | undefined {
    const reader = this.reader;
    const format = reader.u16(subtable);
    const context = this.kind === "GSUB" ? 5 : 7;
    const chained = this.kind === "GSUB" ? 6 : 8;
    if (type === context || type === chained) {
      if (format === 1 || format === 2) return subtable + reader.u16(subtable + 2);
      if (format !== 3) return undefined;
      let at = subtable + 2;
      if (type === chained) at += 2 + reader.u16(at) * 2;
      return reader.u16(at) === 0
        ? undefined
        : subtable + reader.u16(at + (type === chained ? 2 : 4));
    }
    const known = this.kind === "GSUB" ? type >= 1 && type <= 8 : type >= 1 && type <= 6;
    return known && (format === 1 || format === 2)
      ? subtable + reader.u16(subtable + 2)
      : undefined;
  }

  private coverageDigest(offset: number): LookupDigest {
    let digest = this.coverageDigests.get(offset);
    if (digest === undefined) {
      const coverage = this.coverage(offset);
      this.digestWork += coverage.count;
      if (this.digestWork > this.reader.length + 65_536) {
        throw new MalformedFont(`font ${this.kind} coverage tables overlap past their size`);
      }
      const built = new LookupDigest();
      coverage.forEachRange((start, end) => {
        built.add(start, end);
      });
      digest = built;
      this.coverageDigests.set(offset, digest);
    }
    return digest;
  }
}
