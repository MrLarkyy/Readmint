import { buildCmap } from "./buildCmap.js";
import { ByteWriter } from "./ByteWriter.js";
import { glyfTableOf, glyphClosure } from "./glyphClosure.js";
import { componentLength, type GlyfTable } from "./GlyfTable.js";
import { FontRefused } from "./FontRefused.js";
import { MalformedFont } from "./MalformedFont.js";
import { SfntReader } from "./SfntReader.js";
import { subsetName } from "./subsetName.js";
import type { SfntFont } from "./SfntFont.js";
import type { SubsetOptions } from "./SubsetOptions.js";
import { CFF_FLAVOR, TRUETYPE_FLAVOR } from "./sfntFlavor.js";
import { encodeCharstring, writeCff } from "./writeCff.js";
import { writeSfnt } from "./writeSfnt.js";

const haveInstructions = 0x0100;
const moreComponents = 0x0020;

/**
 * A font holding only the glyphs `codePoints` map to (plus .notdef and composite components), renumbered ascending
 * by their original id, with a cmap of exactly those code points. Kept: head, hhea, maxp, OS/2 (fsType included),
 * hmtx, post 3, the Windows name records 0-6, 13, 14, 16, 17 (copyright and licence travel with the subset) and the
 * outlines: glyf/loca without instructions, or a flattened CFF. Everything else (GSUB, GPOS, kern, hinting,
 * variations, colour) is dropped, so a drawer can neither re-shape nor re-kern the text. No clock and no randomness:
 * the same font and code points give the same bytes.
 */
export function subsetFont(
  font: SfntFont,
  codePoints: ReadonlyMap<number, number>,
  options: SubsetOptions = {},
): Uint8Array {
  const size = new SubsetSize(options.maxBytes ?? Infinity);
  const kept = glyphClosure(font, codePoints.values());
  const newId = new Map(kept.map((glyph, index) => [glyph, index]));
  const entries = [...codePoints.entries()]
    .map(([codePoint, glyph]) => [codePoint, newId.get(glyph) ?? 0] as const)
    .sort((left, right) => left[0] - right[0]);
  const tables = new Map<string, Uint8Array>([
    [
      "head",
      patched(required(font, "head"), (view) => {
        view.setInt16(50, 1);
      }),
    ],
    [
      "hhea",
      patched(required(font, "hhea"), (view) => {
        view.setUint16(34, kept.length);
      }),
    ],
    ["OS/2", required(font, "OS/2")],
    ["hmtx", writeHmtx(font, kept)],
    ["cmap", buildCmap(entries)],
    ["post", writePost(font.table("post"))],
    ["name", subsetName(font.table("name"))],
  ]);
  if (font.outlines === "glyf") {
    const { glyf, loca } = writeGlyf(glyfTableOf(font), kept, newId, size);
    tables.set("glyf", glyf);
    tables.set("loca", loca);
    tables.set(
      "maxp",
      patched(required(font, "maxp"), (view) => {
        view.setUint16(4, kept.length);
      }),
    );
    return writeSfnt(TRUETYPE_FLAVOR, tables, true);
  }
  const charStrings = kept.map((glyph) =>
    size.add(encodeCharstring(font.outline(glyph, options.budget), font.advanceOf(glyph))),
  );
  tables.set("CFF ", writeCff(font.familyName, charStrings));
  tables.set("maxp", new ByteWriter(6).u32(0x00005000).u16(kept.length).result());
  return writeSfnt(CFF_FLAVOR, tables, true);
}

/** Running size of the outlines written into a subset, refused past the cap while the subset is built. */
class SubsetSize {
  private total = 0;

  constructor(private readonly max: number) {}

  add(data: Uint8Array): Uint8Array {
    this.total += data.length;
    if (this.total > this.max) {
      throw new FontRefused(
        "too-large",
        `its subset passes ${String(this.max)} bytes of outlines before compression`,
      );
    }
    return data;
  }
}

function required(font: SfntFont, tag: string): Uint8Array {
  const table = font.table(tag);
  if (table === undefined) throw new MalformedFont(`font has no ${tag} table`);
  return table;
}

function patched(table: Uint8Array, change: (view: DataView) => void): Uint8Array {
  const copy = table.slice();
  change(new DataView(copy.buffer));
  return copy;
}

function writeHmtx(font: SfntFont, kept: readonly number[]): Uint8Array {
  const out = new ByteWriter(kept.length * 4);
  for (const glyph of kept) out.u16(font.advanceOf(glyph)).i16(font.bearingOf(glyph));
  return out.result();
}

/** post version 3: no glyph names; angle, underline and pitch kept. */
function writePost(post: Uint8Array | undefined): Uint8Array {
  const out = new ByteWriter(32).u32(0x00030000);
  if (post !== undefined && post.length >= 16) out.bytes(post.subarray(4, 16));
  else out.u32(0).u32(0).u32(0);
  return out.u32(0).u32(0).u32(0).u32(0).result();
}

function writeGlyf(
  glyf: GlyfTable,
  kept: readonly number[],
  newId: ReadonlyMap<number, number>,
  size: SubsetSize,
): { glyf: Uint8Array; loca: Uint8Array } {
  const out = new ByteWriter();
  const loca = new ByteWriter((kept.length + 1) * 4);
  for (const glyph of kept) {
    loca.u32(out.length);
    const data = glyf.data(glyph);
    if (data.length >= 10) out.bytes(size.add(withoutInstructions(data, newId)));
    out.align4();
  }
  loca.u32(out.length);
  return { glyf: out.result(), loca: loca.result() };
}

/**
 * A glyph without its hinting instructions; a composite's components renumbered. Every read is bounded (a glyph
 * whose header promises more than its bytes hold is `MalformedFont`).
 */
function withoutInstructions(data: Uint8Array, newId: ReadonlyMap<number, number>): Uint8Array {
  const reader = new SfntReader(data);
  const contours = reader.i16(0);
  if (contours >= 0) {
    const lengthAt = 10 + contours * 2;
    const instructions = reader.u16(lengthAt);
    const rest = lengthAt + 2 + instructions;
    reader.slice(rest, 0);
    return new ByteWriter(data.length)
      .bytes(reader.slice(0, lengthAt))
      .u16(0)
      .bytes(reader.slice(rest, data.length - rest))
      .result();
  }
  const copy = data.slice();
  const target = new DataView(copy.buffer);
  let offset = 10;
  let flags = moreComponents;
  while ((flags & moreComponents) !== 0) {
    flags = reader.u16(offset);
    const length = componentLength(flags);
    reader.slice(offset, length);
    target.setUint16(offset, flags & ~haveInstructions);
    const component = newId.get(reader.u16(offset + 2));
    if (component === undefined) throw new MalformedFont("subset lost a composite component");
    target.setUint16(offset + 2, component);
    offset += length;
  }
  return copy.subarray(0, offset);
}
