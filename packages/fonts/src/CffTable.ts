import { CffIndex } from "./CffIndex.js";
import type { GlyphOutline } from "./GlyphOutline.js";
import { MalformedFont } from "./MalformedFont.js";
import { dictOffset, readCffDict, type CffDict } from "./readCffDict.js";
import { runCharstring, type CharstringSource } from "./runCharstring.js";
import { SfntReader } from "./SfntReader.js";
import { standardEncodingSid } from "./standardEncoding.js";

const charStringsOp = 17;
const privateOp = 18;
const subrsOp = 19;
const charsetOp = 15;
const charstringTypeOp = 1206;
const rosOp = 1230;
const fdArrayOp = 1236;
const fdSelectOp = 1237;

/** CFF (version 1) outlines, name- or CID-keyed; structures are read once, charstrings run per request. */
export class CffTable implements CharstringSource {
  readonly globalSubrs: CffIndex;
  readonly fontName: string;
  private readonly reader: SfntReader;
  private readonly charStrings: CffIndex;
  private readonly privateSubrs: CffIndex | undefined = undefined;
  /** CID-keyed: the Font DICT index of every glyph and the local subroutines of each Font DICT. */
  private readonly fdSelect: ((glyph: number) => number) | undefined = undefined;
  private readonly fdSubrs: readonly (CffIndex | undefined)[] = [];
  private readonly charsetOffset: number;
  private glyphBySid: Map<number, number> | undefined;

  constructor(data: Uint8Array) {
    const reader = new SfntReader(data);
    this.reader = reader;
    if (reader.u8(0) !== 1) throw new MalformedFont("CFF version is not 1");
    const names = CffIndex.read(reader, reader.u8(2));
    const tops = CffIndex.read(reader, names.end);
    const strings = CffIndex.read(reader, tops.end);
    this.globalSubrs = CffIndex.read(reader, strings.end);
    this.fontName = names.count > 0 ? latin1(names.item(0)) : "";
    const top = readCffDict(tops.item(0));
    if ((top.get(charstringTypeOp)?.[0] ?? 2) !== 2) {
      throw new MalformedFont("CFF charstrings are not Type 2");
    }
    this.charStrings = CffIndex.read(reader, dictOffset(top, charStringsOp));
    this.charsetOffset = dictOffset(top, charsetOp, 0);
    if (top.has(rosOp)) {
      const fonts = CffIndex.read(reader, dictOffset(top, fdArrayOp));
      this.fdSubrs = Array.from({ length: fonts.count }, (_, index) =>
        this.localSubrsOf(readCffDict(fonts.item(index))),
      );
      this.fdSelect = this.readFdSelect(dictOffset(top, fdSelectOp));
    } else {
      this.privateSubrs = this.localSubrsOf(top);
    }
  }

  get glyphCount(): number {
    return this.charStrings.count;
  }

  outline(glyph: number): GlyphOutline {
    return runCharstring(this, glyph);
  }

  charString(glyph: number): Uint8Array {
    return this.charStrings.item(glyph);
  }

  localSubrs(glyph: number): CffIndex | undefined {
    if (this.fdSelect === undefined) return this.privateSubrs;
    const fd = this.fdSelect(glyph);
    if (fd >= this.fdSubrs.length)
      throw new MalformedFont("CFF FDSelect names a missing Font DICT");
    return this.fdSubrs[fd];
  }

  standardGlyph(code: number): number | undefined {
    const sid = standardEncodingSid(code);
    if (sid === 0) return undefined;
    this.glyphBySid ??= this.readCharset();
    return this.glyphBySid.get(sid);
  }

  private localSubrsOf(dict: CffDict): CffIndex | undefined {
    const location = dict.get(privateOp);
    if (location === undefined) return undefined;
    const [size = -1, offset = -1] = location;
    if (!Number.isInteger(size) || !Number.isInteger(offset) || size < 0 || offset < 0) {
      throw new MalformedFont("CFF Private DICT location is invalid");
    }
    const privateDict = readCffDict(this.reader.slice(offset, size));
    if (!privateDict.has(subrsOp)) return undefined;
    return CffIndex.read(this.reader, offset + dictOffset(privateDict, subrsOp));
  }

  private readFdSelect(offset: number): (glyph: number) => number {
    const format = this.reader.u8(offset);
    const count = this.charStrings.count;
    if (format === 0) {
      this.reader.slice(offset + 1, count);
      return (glyph) => this.reader.u8(offset + 1 + glyph);
    }
    if (format !== 3) throw new MalformedFont("CFF FDSelect format is not 0 or 3");
    const ranges = this.reader.u16(offset + 1);
    this.reader.slice(offset + 3, ranges * 3 + 2);
    return (glyph) => {
      let low = 0;
      let high = ranges - 1;
      while (low < high) {
        const middle = (low + high + 1) >>> 1;
        if (this.reader.u16(offset + 3 + middle * 3) <= glyph) low = middle;
        else high = middle - 1;
      }
      return this.reader.u8(offset + 3 + low * 3 + 2);
    };
  }

  /** Standard string id -> glyph, from the charset; only what `seac` needs. */
  private readCharset(): Map<number, number> {
    const count = this.charStrings.count;
    const found = new Map<number, number>();
    if (this.charsetOffset === 0) {
      for (let glyph = 1; glyph < count; glyph++) found.set(glyph, glyph);
      return found;
    }
    if (this.charsetOffset < 3) return found;
    const format = this.reader.u8(this.charsetOffset);
    let at = this.charsetOffset + 1;
    let glyph = 1;
    while (glyph < count) {
      if (format === 0) {
        found.set(this.reader.u16(at), glyph++);
        at += 2;
        continue;
      }
      if (format !== 1 && format !== 2) throw new MalformedFont("CFF charset format is unknown");
      const first = this.reader.u16(at);
      const left = format === 1 ? this.reader.u8(at + 2) : this.reader.u16(at + 2);
      at += format === 1 ? 3 : 4;
      for (let index = 0; index <= left && glyph < count; index++)
        found.set(first + index, glyph++);
    }
    return found;
  }
}

function latin1(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}
