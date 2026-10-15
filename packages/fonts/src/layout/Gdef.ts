import { MalformedFont } from "../MalformedFont.js";
import type { SfntReader } from "../SfntReader.js";
import { ClassDef } from "./ClassDef.js";
import { Coverage } from "./Coverage.js";

/** GDEF glyph classes. */
export const GlyphClass = {
  none: 0,
  base: 1,
  ligature: 2,
  mark: 3,
  component: 4,
} as const;

/** Mark glyph sets a font may define (each one Coverage table). */
export const maxMarkSets = 1024;

/**
 * The GDEF table: glyph classes, mark attachment classes and mark glyph sets, read when the font is first shaped.
 * A font without GDEF has no classes (the shaper derives them from Unicode).
 */
export class Gdef {
  private readonly markSets: (Coverage | undefined)[] = [];

  private constructor(
    private readonly glyphClasses: ClassDef | undefined,
    private readonly attachClasses: ClassDef,
    private readonly reader: SfntReader | undefined,
    private readonly markSetOffsets: readonly number[],
  ) {}

  static readonly empty = new Gdef(undefined, ClassDef.empty, undefined, []);

  static read(reader: SfntReader | undefined): Gdef {
    if (reader === undefined) return Gdef.empty;
    if (reader.u16(0) !== 1) return Gdef.empty;
    const minor = reader.u16(2);
    const classes = reader.u16(4);
    const attach = reader.u16(10);
    const sets: number[] = [];
    const setsOffset = minor >= 2 ? reader.u16(12) : 0;
    if (setsOffset !== 0 && reader.u16(setsOffset) === 1) {
      const count = reader.u16(setsOffset + 2);
      if (count > maxMarkSets) throw new MalformedFont("font GDEF has too many mark glyph sets");
      for (let index = 0; index < count; index++) {
        sets.push(setsOffset + reader.u32(setsOffset + 4 + index * 4));
      }
    }
    return new Gdef(
      classes === 0 ? undefined : ClassDef.read(reader, classes),
      attach === 0 ? ClassDef.empty : ClassDef.read(reader, attach),
      reader,
      sets,
    );
  }

  /** Whether the font classifies its glyphs (else every class is 0). */
  get hasGlyphClasses(): boolean {
    return this.glyphClasses !== undefined;
  }

  glyphClass(glyph: number): number {
    const value = this.glyphClasses?.classOf(glyph) ?? 0;
    return value <= GlyphClass.component ? value : GlyphClass.none;
  }

  markAttachClass(glyph: number): number {
    return this.attachClasses.classOf(glyph);
  }

  /** Whether `glyph` is in mark glyph set `set`; a set the font does not define holds nothing. */
  inMarkSet(set: number, glyph: number): boolean {
    const offset = this.markSetOffsets[set];
    if (offset === undefined || this.reader === undefined) return false;
    let coverage = this.markSets[set];
    if (coverage === undefined) {
      coverage = Coverage.read(this.reader, offset);
      this.markSets[set] = coverage;
    }
    return coverage.index(glyph) >= 0;
  }
}
