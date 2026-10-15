import { describe, expect, test } from "vitest";
import { ByteWriter } from "../src/ByteWriter.js";
import { CffIndex } from "../src/CffIndex.js";
import { MalformedFont } from "../src/MalformedFont.js";
import { runCharstring, type CharstringSource } from "../src/runCharstring.js";
import { SfntReader } from "../src/SfntReader.js";
import { montserrat, parse } from "./testFonts.js";

/** A CFF INDEX of the given items (offset size 2). */
function index(items: readonly number[][]): CffIndex {
  const out = new ByteWriter().u16(items.length).u8(2);
  let offset = 1;
  out.u16(offset);
  for (const item of items) {
    offset += item.length;
    out.u16(offset);
  }
  for (const item of items) for (const byte of item) out.u8(byte);
  return CffIndex.read(new SfntReader(out.result()), 0);
}

/** Type 2 operand bytes of small integers (-107..107). */
const n = (...values: number[]) => values.map((value) => value + 139);

const rmoveto = 21;
const rlineto = 5;
const endchar = 14;
const callsubr = 10;

function source(
  charStrings: number[][],
  subrs: number[][] = [],
  standard: Record<number, number> = {},
): CharstringSource {
  const strings = index(charStrings);
  return {
    charString: (glyph) => strings.item(glyph),
    globalSubrs: index([]),
    localSubrs: () => (subrs.length === 0 ? undefined : index(subrs)),
    standardGlyph: (code) => standard[code],
  };
}

describe("Type 2 charstrings", () => {
  test("Montserrat OTF: A is one closed contour of lines", () => {
    const font = parse(montserrat.otf);
    const outline = font.outline(font.glyphFor(0x41));
    expect(outline).toHaveLength(13);
    expect(outline[0]).toEqual({ type: "M", x: 733, y: 0 });
    expect(outline.filter((command) => command.type === "Z")).toHaveLength(2);
    const o = font.outline(font.glyphFor(0x6f));
    expect(o.some((command) => command.type === "C")).toBe(true);
  });

  test("a width before the first move is skipped", () => {
    const outline = runCharstring(
      source([[...n(50, 10, 20), rmoveto, ...n(5, 0), rlineto, endchar]]),
      0,
    );
    expect(outline).toEqual([
      { type: "M", x: 10, y: 20 },
      { type: "L", x: 15, y: 20 },
      { type: "Z" },
    ]);
  });

  test("subroutines are inlined with the bias of their index", () => {
    // 1 local subroutine: bias 107, so index 0 is called as -107.
    const outline = runCharstring(
      source([[...n(0, 0), rmoveto, ...n(-107), callsubr, endchar]], [[...n(7, 7), rlineto, 11]]),
      0,
    );
    expect(outline).toEqual([{ type: "M", x: 0, y: 0 }, { type: "L", x: 7, y: 7 }, { type: "Z" }]);
  });

  test("a subroutine that calls itself is malformed within the call depth", () => {
    const started = performance.now();
    expect(() =>
      runCharstring(source([[...n(-107), callsubr, endchar]], [[...n(-107), callsubr, 11]]), 0),
    ).toThrow(MalformedFont);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test("a charstring longer than the operation cap is malformed", () => {
    const loop = Array.from({ length: 30_000 }, () => n(1, 1)).flat();
    expect(() => runCharstring(source([[...loop, endchar]]), 0)).toThrow(MalformedFont);
  });

  test("a stack deeper than 48 operands is malformed", () => {
    expect(() => runCharstring(source([[...n(...Array<number>(49).fill(1)), endchar]]), 0)).toThrow(
      MalformedFont,
    );
  });

  test("seac composes the base and the accent moved by its offset", () => {
    const glyphs = [
      [...n(0, 0), rmoveto, ...n(10, 0), rlineto, endchar],
      [...n(0, 0), rmoveto, ...n(0, 10), rlineto, endchar],
      [...n(100, 3, 4, 65, 66), endchar],
    ];
    const outline = runCharstring(source(glyphs, [], { 65: 0, 66: 1 }), 2);
    expect(outline).toEqual([
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10, y: 0 },
      { type: "Z" },
      { type: "M", x: 3, y: 4 },
      { type: "L", x: 3, y: 14 },
      { type: "Z" },
    ]);
  });

  test("seac naming a glyph the font lacks is malformed", () => {
    expect(() => runCharstring(source([[...n(3, 4, 65, 66), endchar]]), 0)).toThrow(MalformedFont);
  });
});
