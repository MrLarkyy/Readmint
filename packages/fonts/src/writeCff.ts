import { ByteWriter } from "./ByteWriter.js";
import type { GlyphOutline } from "./GlyphOutline.js";

/** The first custom string id: 0..390 are the CFF standard strings. */
const firstCustomSid = 391;

/**
 * A name-keyed CFF (version 1) of flattened charstrings: no subroutines, no hints, glyph names `g<n>`. Offsets are
 * written as five-byte integers, so the Top DICT has the same size whatever they are.
 */
export function writeCff(fontName: string, charStrings: readonly Uint8Array[]): Uint8Array {
  const count = charStrings.length;
  const names = Array.from({ length: Math.max(0, count - 1) }, (_, index) =>
    ascii(`g${String(index + 1)}`),
  );
  const header = Uint8Array.of(1, 0, 4, 4);
  const nameIndex = writeIndex([postScriptName(fontName)]);
  const stringIndex = writeIndex(names);
  const globalSubrs = writeIndex([]);
  const charset = new ByteWriter(1 + names.length * 2).u8(0);
  for (let index = 0; index < names.length; index++) charset.u16(firstCustomSid + index);
  const charsetBytes = charset.result();
  const charStringIndex = writeIndex(charStrings);
  const privateDict = Uint8Array.of(139, 20);
  const topSize = writeIndex([topDict(0, 0, 0, 0)]).length;
  const charsetOffset =
    header.length + nameIndex.length + topSize + stringIndex.length + globalSubrs.length;
  const charStringsOffset = charsetOffset + charsetBytes.length;
  const privateOffset = charStringsOffset + charStringIndex.length;
  const top = writeIndex([
    topDict(charsetOffset, charStringsOffset, privateDict.length, privateOffset),
  ]);
  return new ByteWriter(privateOffset + privateDict.length)
    .bytes(header)
    .bytes(nameIndex)
    .bytes(top)
    .bytes(stringIndex)
    .bytes(globalSubrs)
    .bytes(charsetBytes)
    .bytes(charStringIndex)
    .bytes(privateDict)
    .result();
}

function topDict(
  charset: number,
  charStrings: number,
  privateSize: number,
  privateAt: number,
): Uint8Array {
  const out = new ByteWriter(32);
  const integer = (value: number) => out.u8(29).i32(value);
  integer(charset);
  out.u8(15);
  integer(charStrings);
  out.u8(17);
  integer(privateSize);
  integer(privateAt);
  out.u8(18);
  return out.result();
}

function writeIndex(items: readonly Uint8Array[]): Uint8Array {
  if (items.length === 0) return Uint8Array.of(0, 0);
  let total = 1;
  for (const item of items) total += item.length;
  const offsetSize = total < 0x100 ? 1 : total < 0x10000 ? 2 : total < 0x1000000 ? 3 : 4;
  const out = new ByteWriter(3 + (items.length + 1) * offsetSize + total);
  out.u16(items.length).u8(offsetSize);
  let offset = 1;
  const writeOffset = (value: number) => {
    for (let shift = (offsetSize - 1) * 8; shift >= 0; shift -= 8) out.u8((value >>> shift) & 0xff);
  };
  writeOffset(offset);
  for (const item of items) {
    offset += item.length;
    writeOffset(offset);
  }
  for (const item of items) out.bytes(item);
  return out.result();
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0x7f);
}

/**
 * A CFF font name browsers accept: at most 63 letters, digits, `-`, `_` and `.` (Chromium's font sanitizer refuses
 * spaces and `[](){}<>/%`, and then draws the text with another font).
 */
function postScriptName(name: string): Uint8Array {
  const safe = name.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 63);
  return ascii(safe === "" ? "Subset" : safe);
}

/**
 * A Type 2 charstring drawing `outline` with an explicit advance `width` (nominalWidthX is 0): rmoveto, rlineto and
 * rrcurveto only, quadratic segments raised to cubic.
 */
export function encodeCharstring(outline: GlyphOutline, width: number): Uint8Array {
  const out = new ByteWriter(64 + outline.length * 16);
  const operands = (...values: number[]) => {
    for (const value of values) writeNumber(out, value);
  };
  if (width !== 0) operands(width);
  let x = 0;
  let y = 0;
  for (const command of outline) {
    switch (command.type) {
      case "M":
        operands(command.x - x, command.y - y);
        out.u8(21);
        break;
      case "L":
        operands(command.x - x, command.y - y);
        out.u8(5);
        break;
      case "Q": {
        const c1x = x + ((command.x1 - x) * 2) / 3;
        const c1y = y + ((command.y1 - y) * 2) / 3;
        const c2x = command.x + ((command.x1 - command.x) * 2) / 3;
        const c2y = command.y + ((command.y1 - command.y) * 2) / 3;
        operands(c1x - x, c1y - y, c2x - c1x, c2y - c1y, command.x - c2x, command.y - c2y);
        out.u8(8);
        break;
      }
      case "C":
        operands(
          command.x1 - x,
          command.y1 - y,
          command.x2 - command.x1,
          command.y2 - command.y1,
          command.x - command.x2,
          command.y - command.y2,
        );
        out.u8(8);
        break;
      case "Z":
        continue;
    }
    x = command.x;
    y = command.y;
  }
  out.u8(14);
  return out.result();
}

function writeNumber(out: ByteWriter, value: number): void {
  if (Number.isInteger(value) && value >= -107 && value <= 107) {
    out.u8(value + 139);
  } else if (Number.isInteger(value) && value >= 108 && value <= 1131) {
    const rest = value - 108;
    out.u8((rest >> 8) + 247).u8(rest & 0xff);
  } else if (Number.isInteger(value) && value >= -1131 && value <= -108) {
    const rest = -value - 108;
    out.u8((rest >> 8) + 251).u8(rest & 0xff);
  } else if (Number.isInteger(value) && value >= -32768 && value <= 32767) {
    out.u8(28).i16(value);
  } else {
    out.u8(255).i32(Math.round(value * 65536));
  }
}
