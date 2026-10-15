import { ByteWriter } from "../src/ByteWriter.js";
import { buildTestFont, type TestGlyph } from "./buildTestFont.js";

export interface TestCffOptions {
  /** Type 2 charstrings, glyph 0 first. */
  readonly charStrings: readonly (readonly number[])[];
  readonly globalSubrs?: readonly (readonly number[])[];
  /** Six decimal numbers, written as DICT reals; omitted: the CFF default 0.001 matrix. */
  readonly fontMatrix?: readonly string[];
}

/**
 * A name-keyed CFF table: name "T", the ISOAdobe charset, global subroutines, no local ones. Offsets are five-byte
 * integers, so the Top DICT's size does not depend on them.
 */
export function buildTestCff(options: TestCffOptions): Uint8Array {
  const header = [1, 0, 4, 4];
  const names = index([[0x54]]);
  const strings = index([]);
  const globals = index(options.globalSubrs ?? []);
  const charStrings = index(options.charStrings);
  const privateDict = [139, 20];
  const top = (charStringsAt: number, privateAt: number) =>
    index([topDict(options, charStringsAt, privateAt)]);
  const before = header.length + names.length + top(0, 0).length + strings.length + globals.length;
  const privateAt = before + charStrings.length;
  return Uint8Array.from([
    ...header,
    ...names,
    ...top(before, privateAt),
    ...strings,
    ...globals,
    ...charStrings,
    ...privateDict,
  ]);
}

function topDict(options: TestCffOptions, charStringsAt: number, privateAt: number): number[] {
  const out: number[] = [];
  if (options.fontMatrix !== undefined) {
    for (const value of options.fontMatrix) out.push(...real(value));
    out.push(12, 7);
  }
  out.push(...integer(charStringsAt), 17, ...integer(2), ...integer(privateAt), 18);
  return out;
}

function integer(value: number): number[] {
  return [...new ByteWriter(5).u8(29).i32(value).result()];
}

/** A DICT real: nibbles of the decimal text, `.` = a, `-` = e, end = f. */
function real(text: string): number[] {
  const nibbles = Array.from(text, (char) =>
    char === "." ? 0xa : char === "-" ? 0xe : Number(char),
  );
  nibbles.push(0xf);
  if (nibbles.length % 2 === 1) nibbles.push(0xf);
  const bytes = [30];
  for (let at = 0; at < nibbles.length; at += 2)
    bytes.push(((nibbles[at] ?? 0) << 4) | (nibbles[at + 1] ?? 0));
  return bytes;
}

/** A CFF INDEX with four-byte offsets. */
function index(items: readonly (readonly number[])[]): number[] {
  if (items.length === 0) return [0, 0];
  const out = new ByteWriter().u16(items.length).u8(4);
  let offset = 1;
  out.u32(offset);
  for (const item of items) {
    offset += item.length;
    out.u32(offset);
  }
  for (const item of items) for (const byte of item) out.u8(byte);
  return [...out.result()];
}

/** Type 2 operand bytes of small integers (-107..107). */
export const operands = (...values: number[]): number[] => values.map((value) => value + 139);

/**
 * `glyphs` glyphs (after .notdef) that each call one global subroutine of 48 operands and an rrcurveto 380 times:
 * 19 763 charstring operations a glyph, just under the per-glyph cap, but over 20 kB of curves once flattened.
 */
export function expandingCff(glyphs: number, fontMatrix?: readonly string[]): Uint8Array {
  const subroutine = [...operands(...Array<number>(48).fill(1)), 8, 11];
  const heavy = [
    ...operands(0, 0),
    21,
    ...Array.from({ length: 380 }, () => [...operands(-107), 29]).flat(),
    14,
  ];
  return buildTestCff({
    charStrings: [[14], ...Array.from({ length: glyphs }, () => heavy)],
    globalSubrs: [subroutine],
    ...(fontMatrix === undefined ? {} : { fontMatrix }),
  });
}

/** An OTF "Heavy" whose `count` glyphs (U+4E00 on) are the expanding glyphs of `expandingCff` (review probe 7). */
export function expandingFont(
  count: number,
  unitsPerEm = 1000,
  fontMatrix?: readonly string[],
): Uint8Array {
  const glyphs: TestGlyph[] = [
    { advance: 500 },
    ...Array.from({ length: count }, (_, index) => ({
      codePoints: [0x4e00 + index],
      advance: 600,
    })),
  ];
  return buildTestFont({
    family: "Heavy",
    unitsPerEm,
    glyphs,
    cff: expandingCff(count, fontMatrix),
  });
}
