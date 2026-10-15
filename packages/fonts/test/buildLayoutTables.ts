import { ByteWriter } from "../src/ByteWriter.js";

/**
 * A field of an OpenType structure: a u16, an i16, a u32, a tag, or an offset (16 or 32 bit, from the structure's
 * start) to a child written after the structure's own fields; a null offset is 0.
 */
export type Field =
  | number
  | { readonly i16: number }
  | { readonly u32: number }
  | { readonly tag: string }
  | { readonly offset: Uint8Array | null }
  | { readonly offset32: Uint8Array };

/** Serializes fields, then the children their offsets point to, in field order. */
export function struct(fields: readonly Field[]): Uint8Array {
  let header = 0;
  for (const field of fields) {
    header += typeof field === "number" || "i16" in field || "offset" in field ? 2 : 4;
  }
  const out = new ByteWriter();
  const children: Uint8Array[] = [];
  let next = header;
  for (const field of fields) {
    if (typeof field === "number") out.u16(field);
    else if ("i16" in field) out.i16(field.i16);
    else if ("u32" in field) out.u32(field.u32);
    else if ("tag" in field) out.tag(field.tag);
    else if ("offset" in field) {
      if (field.offset === null) {
        out.u16(0);
        continue;
      }
      out.u16(next);
      children.push(field.offset);
      next += field.offset.length;
    } else {
      out.u32(next);
      children.push(field.offset32);
      next += field.offset32.length;
    }
  }
  for (const child of children) out.bytes(child);
  return out.result();
}

/** A u16 count followed by the values. */
export function list(values: readonly number[]): Field[] {
  return [values.length, ...values];
}

/** Coverage format 1 of the glyphs (sorted here). */
export function coverage(glyphs: readonly number[]): Uint8Array {
  return struct([1, ...list([...glyphs].sort((left, right) => left - right))]);
}

/** ClassDef format 2, one range per glyph. */
export function classDef(
  classes: readonly (readonly [glyph: number, value: number])[],
): Uint8Array {
  const sorted = [...classes].sort((left, right) => left[0] - right[0]);
  return struct([2, sorted.length, ...sorted.flatMap(([glyph, value]) => [glyph, glyph, value])]);
}

export interface TestLookup {
  readonly type: number;
  readonly flag?: number;
  readonly subtables: readonly Uint8Array[];
  readonly markFilteringSet?: number;
}

export interface TestFeature {
  readonly tag: string;
  readonly lookups: readonly number[];
}

/**
 * A GSUB or GPOS table with one script (DFLT unless given) whose default LangSys lists every feature, in order.
 */
export function layoutTable(
  features: readonly TestFeature[],
  lookups: readonly TestLookup[],
  script = "DFLT",
): Uint8Array {
  const langSys = struct([0, 0xffff, ...list(features.map((_, index) => index))]);
  const scriptTable = struct([{ offset: langSys }, 0]);
  const scriptList = struct([1, { tag: script }, { offset: scriptTable }]);
  const featureList = struct([
    features.length,
    ...features.flatMap((feature): Field[] => [
      { tag: feature.tag },
      { offset: struct([0, ...list(feature.lookups)]) },
    ]),
  ]);
  const lookupList = struct([
    lookups.length,
    ...lookups.map((lookup): Field => ({
      offset: struct([
        lookup.type,
        lookup.flag ?? 0,
        lookup.subtables.length,
        ...lookup.subtables.map((subtable): Field => ({ offset: subtable })),
        ...(lookup.markFilteringSet === undefined ? [] : [lookup.markFilteringSet]),
      ]),
    })),
  ]);
  return struct([
    { u32: 0x00010000 },
    { offset: scriptList },
    { offset: featureList },
    { offset: lookupList },
  ]);
}

export interface TestGdef {
  /** Glyph classes: 1 base, 2 ligature, 3 mark, 4 component. */
  readonly classes: readonly (readonly [glyph: number, value: number])[];
  readonly attachClasses?: readonly (readonly [glyph: number, value: number])[];
  readonly markSets?: readonly (readonly number[])[];
}

export function gdef(options: TestGdef): Uint8Array {
  const markSets =
    options.markSets === undefined
      ? null
      : struct([
          1,
          options.markSets.length,
          ...options.markSets.map((set): Field => ({ offset32: coverage(set) })),
        ]);
  return struct([
    1,
    options.markSets === undefined ? 0 : 2,
    { offset: classDef(options.classes) },
    { offset: null },
    { offset: null },
    { offset: options.attachClasses === undefined ? null : classDef(options.attachClasses) },
    ...(markSets === null ? [] : [{ offset: markSets }]),
  ]);
}

/** An anchor, format 1. */
export function anchor(x: number, y: number): Uint8Array {
  return struct([1, { i16: x }, { i16: y }]);
}

/** An extension subtable (GSUB 7 / GPOS 9) around a subtable of `type`. */
export function extension(type: number, subtable: Uint8Array): Uint8Array {
  return struct([1, type, { offset32: subtable }]);
}
