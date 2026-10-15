import { buildCmap } from "../src/buildCmap.js";
import { ByteWriter } from "../src/ByteWriter.js";
import { CFF_FLAVOR, TRUETYPE_FLAVOR } from "../src/sfntFlavor.js";
import { binarySearchHeader, writeSfnt } from "../src/writeSfnt.js";

/** A point of a quadratic contour: x, y, on-curve. */
export type TestPoint = readonly [x: number, y: number, on: boolean];

export interface TestGlyph {
  readonly codePoints?: readonly number[];
  readonly advance: number;
  readonly contours?: readonly (readonly TestPoint[])[];
  /** A composite glyph: these glyphs moved by dx, dy. */
  readonly components?: readonly {
    readonly glyph: number;
    readonly dx: number;
    readonly dy: number;
  }[];
}

export interface TestFontOptions {
  readonly family: string;
  readonly weight?: number;
  readonly fsType?: number;
  readonly unitsPerEm?: number;
  /** Glyph 0 is .notdef. */
  readonly glyphs: readonly TestGlyph[];
  /** Pairs for a version 0 `kern` table (format 0). */
  readonly kern?: readonly (readonly [left: number, right: number, value: number])[];
  /** Pairs for a GPOS PairPos format 1 lookup under feature `kern` of script DFLT. */
  readonly gpos?: readonly (readonly [left: number, right: number, value: number])[];
  /** A CFF table (`buildTestCff`): the font gets CFF outlines instead of glyf (glyph contours are ignored). */
  readonly cff?: Uint8Array;
  /** Further tables by tag (GDEF, GSUB, GPOS from `buildLayoutTables`), replacing any built here. */
  readonly tables?: Readonly<Record<string, Uint8Array>>;
  /** Windows name records by name id, replacing the default ones (0-6, 13, 14) or adding to them. */
  readonly names?: Readonly<Record<number, string>>;
}

/**
 * A small TrueType (or CFF) font built from a description, byte for byte the same on every run: the tests own every
 * table, so each reader can be checked against values they set (kern pairs, GPOS pairs, composites, fsType). Its name
 * table says what every font made here is: original work of the Readmint contributors under the SIL Open Font
 * License 1.1, no Reserved Font Name (unless `names` replaces those records, e.g. to test the Reserved Font Name
 * policy).
 */
export function buildTestFont(options: TestFontOptions): Uint8Array {
  const glyphData = options.glyphs.map((glyph) => encodeGlyph(glyph));
  const boxes = glyphData.map((data) => data.box);
  const unitsPerEm = options.unitsPerEm ?? 1000;
  const tables = new Map<string, Uint8Array>([
    ["head", head(unitsPerEm, boxes)],
    ["hhea", hhea(options.glyphs)],
    ["maxp", maxp(options.glyphs.length)],
    ["OS/2", os2(options)],
    ["hmtx", hmtx(options.glyphs, boxes)],
    ["cmap", cmap(options.glyphs)],
    ["name", name(options.family, options.names ?? {})],
    [
      "post",
      new ByteWriter(32).u32(0x00030000).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0).u32(0).result(),
    ],
  ]);
  if (options.kern !== undefined) tables.set("kern", kern(options.kern));
  if (options.gpos !== undefined) tables.set("GPOS", gpos(options.gpos));
  for (const [tag, table] of Object.entries(options.tables ?? {})) tables.set(tag, table);
  if (options.cff !== undefined) {
    tables.set("CFF ", options.cff);
    tables.set("maxp", new ByteWriter(6).u32(0x00005000).u16(options.glyphs.length).result());
    return writeSfnt(CFF_FLAVOR, tables, true);
  }
  const glyf = new ByteWriter();
  const loca = new ByteWriter();
  for (const data of glyphData) {
    loca.u32(glyf.length);
    glyf.bytes(data.bytes).align4();
  }
  loca.u32(glyf.length);
  tables.set("glyf", glyf.result());
  tables.set("loca", loca.result());
  return writeSfnt(TRUETYPE_FLAVOR, tables, true);
}

type Box = readonly [xMin: number, yMin: number, xMax: number, yMax: number];

function encodeGlyph(glyph: TestGlyph): { bytes: Uint8Array; box: Box } {
  if (glyph.components !== undefined) {
    const box: Box = [0, 0, glyph.advance, 700];
    const out = new ByteWriter().i16(-1).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]);
    glyph.components.forEach((component, index) => {
      const more = index < (glyph.components?.length ?? 0) - 1 ? 0x0020 : 0;
      out
        .u16(0x0001 | 0x0002 | more)
        .u16(component.glyph)
        .i16(component.dx)
        .i16(component.dy);
    });
    return { bytes: out.result(), box };
  }
  const contours = glyph.contours ?? [];
  const points = contours.flat();
  if (points.length === 0) return { bytes: new Uint8Array(0), box: [0, 0, 0, 0] };
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const out = new ByteWriter().i16(contours.length).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]);
  let end = -1;
  for (const contour of contours) {
    end += contour.length;
    out.u16(end);
  }
  out.u16(0);
  for (const point of points) out.u8(point[2] ? 1 : 0);
  let previous = 0;
  for (const x of xs) {
    out.i16(x - previous);
    previous = x;
  }
  previous = 0;
  for (const y of ys) {
    out.i16(y - previous);
    previous = y;
  }
  return { bytes: out.result(), box };
}

function head(unitsPerEm: number, boxes: readonly Box[]): Uint8Array {
  const out = new ByteWriter(54).u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5);
  out.u16(0x000b).u16(unitsPerEm).u32(0).u32(0).u32(0).u32(0);
  out.i16(Math.min(...boxes.map((box) => box[0]))).i16(Math.min(...boxes.map((box) => box[1])));
  out.i16(Math.max(...boxes.map((box) => box[2]))).i16(Math.max(...boxes.map((box) => box[3])));
  return out.u16(0).u16(8).i16(2).i16(1).i16(0).result();
}

function hhea(glyphs: readonly TestGlyph[]): Uint8Array {
  const out = new ByteWriter(36).u32(0x00010000).i16(800).i16(-200).i16(0);
  out
    .u16(Math.max(...glyphs.map((glyph) => glyph.advance)))
    .i16(0)
    .i16(0)
    .i16(0);
  out.i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0);
  return out.u16(glyphs.length).result();
}

function maxp(count: number): Uint8Array {
  const out = new ByteWriter(32).u32(0x00010000).u16(count).u16(256).u16(16).u16(256).u16(16);
  return out.u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(4).u16(1).result();
}

function os2(options: TestFontOptions): Uint8Array {
  const out = new ByteWriter(96)
    .u16(4)
    .i16(500)
    .u16(options.weight ?? 400)
    .u16(5);
  out.u16(options.fsType ?? 0);
  for (let index = 0; index < 11; index++) out.i16(0);
  for (let index = 0; index < 10; index++) out.u8(0);
  out.u32(0).u32(0).u32(0).u32(0).tag("RMNT").u16(0x00c0).u16(0x20).u16(0xffff);
  out.i16(800).i16(-200).i16(0).u16(800).u16(200).u32(1).u32(0);
  return out.i16(500).i16(700).u16(0).u16(0x20).u16(1).result();
}

function hmtx(glyphs: readonly TestGlyph[], boxes: readonly Box[]): Uint8Array {
  const out = new ByteWriter(glyphs.length * 4);
  glyphs.forEach((glyph, index) => out.u16(glyph.advance).i16(boxes[index]?.[0] ?? 0));
  return out.result();
}

function cmap(glyphs: readonly TestGlyph[]): Uint8Array {
  const entries = glyphs
    .flatMap((glyph, index) =>
      (glyph.codePoints ?? []).map((codePoint) => [codePoint, index] as const),
    )
    .sort((left, right) => left[0] - right[0]);
  return buildCmap(entries);
}

function name(family: string, names: Readonly<Record<number, string>>): Uint8Array {
  const defaults: (readonly [number, string])[] = [
    [0, "Copyright 2026 The Readmint Contributors"],
    [1, family],
    [2, "Regular"],
    [3, `${family} test`],
    [4, family],
    [5, "Version 1.000"],
    [6, family.replaceAll(" ", "")],
    [
      13,
      "This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org",
    ],
    [14, "https://openfontlicense.org"],
  ];
  const chosen = new Map(defaults);
  for (const [id, text] of Object.entries(names)) chosen.set(Number(id), text);
  const strings = [...chosen].sort((left, right) => left[0] - right[0]);
  const out = new ByteWriter()
    .u16(0)
    .u16(strings.length)
    .u16(6 + strings.length * 12);
  let offset = 0;
  const encoded = strings.map(([id, text]) => {
    const bytes = new ByteWriter();
    for (const char of text) bytes.u16(char.charCodeAt(0));
    return [id, bytes.result()] as const;
  });
  for (const [id, bytes] of encoded) {
    out.u16(3).u16(1).u16(0x409).u16(id).u16(bytes.length).u16(offset);
    offset += bytes.length;
  }
  for (const [, bytes] of encoded) out.bytes(bytes);
  return out.result();
}

function kern(pairs: readonly (readonly [number, number, number])[]): Uint8Array {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const { power, exponent } = binarySearchHeader(sorted.length);
  const out = new ByteWriter()
    .u16(0)
    .u16(1)
    .u16(0)
    .u16(14 + sorted.length * 6)
    .u16(0x0001);
  out
    .u16(sorted.length)
    .u16(power * 6)
    .u16(exponent)
    .u16((sorted.length - power) * 6);
  for (const [left, right, value] of sorted) out.u16(left).u16(right).i16(value);
  return out.result();
}

/** GPOS 1.0 with script DFLT, feature kern and one PairPos format 1 lookup (xAdvance of the first glyph). */
function gpos(pairs: readonly (readonly [number, number, number])[]): Uint8Array {
  const lefts = [...new Set(pairs.map((pair) => pair[0]))].sort((a, b) => a - b);
  const sets = lefts.map((left) =>
    pairs.filter((pair) => pair[0] === left).sort((a, b) => a[1] - b[1]),
  );
  const coverageSize = 4 + lefts.length * 2;
  const subtable = new ByteWriter();
  const setsStart = 10 + lefts.length * 2 + coverageSize;
  subtable
    .u16(1)
    .u16(10 + lefts.length * 2)
    .u16(0x0004)
    .u16(0)
    .u16(lefts.length);
  let offset = setsStart;
  for (const set of sets) {
    subtable.u16(offset);
    offset += 2 + set.length * 4;
  }
  subtable.u16(1).u16(lefts.length);
  for (const left of lefts) subtable.u16(left);
  for (const set of sets) {
    subtable.u16(set.length);
    for (const [, right, value] of set) subtable.u16(right).i16(value);
  }
  const scriptList = new ByteWriter().u16(1).tag("DFLT").u16(8).u16(4).u16(0);
  scriptList.u16(0).u16(0xffff).u16(1).u16(0);
  const featureList = new ByteWriter().u16(1).tag("kern").u16(8).u16(0).u16(1).u16(0);
  const lookupList = new ByteWriter().u16(1).u16(4).u16(2).u16(0).u16(1).u16(8);
  const scripts = scriptList.result();
  const features = featureList.result();
  const lookups = lookupList.result();
  return new ByteWriter()
    .u32(0x00010000)
    .u16(10)
    .u16(10 + scripts.length)
    .u16(10 + scripts.length + features.length)
    .bytes(scripts)
    .bytes(features)
    .bytes(lookups)
    .bytes(subtable.result())
    .result();
}
