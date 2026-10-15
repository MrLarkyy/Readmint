import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { ByteWriter } from "../src/ByteWriter.js";
import { MalformedFont, shapeText, type SfntFont } from "../src/index.js";
import {
  coverage,
  extension,
  layoutTable,
  list,
  struct,
  type TestLookup,
} from "./buildLayoutTables.js";
import { glyph, layoutFont } from "./layoutFont.js";

const { a, b, x } = glyph;

/** The criterion's bound for a hostile table to fail. */
const ceilingMs = 50;

/** The bound for the run: the load is probed before and after, as a spike can end before the probe runs. */
function failure(font: SfntFont, text: string): { error: unknown; ms: number; limitMs: number } {
  const scaleBefore = loadScale();
  const started = performance.now();
  let error: unknown;
  try {
    shapeText(font, text);
  } catch (caught) {
    error = caught;
  }
  const ms = performance.now() - started;
  return { error, ms, limitMs: ceilingMs * Math.max(scaleBefore, loadScale()) };
}

function expectMalformed(font: SfntFont, text: string, message: RegExp): void {
  const { error, ms, limitMs } = failure(font, text);
  expect(error).toBeInstanceOf(MalformedFont);
  expect((error as Error).message).toMatch(message);
  expect(ms).toBeLessThan(limitMs);
}

const gsubFont = (lookups: readonly TestLookup[], featureLookups = [0]) =>
  layoutFont({ gsub: { features: [{ tag: "ccmp", lookups: featureLookups }], lookups } });

describe("hostile layout tables fail as MalformedFont within the caps", () => {
  test("a context lookup calling itself stops at nesting depth 8", () => {
    const recursive: TestLookup = {
      type: 5,
      subtables: [struct([3, 1, 1, { offset: coverage([a]) }, 0, 0])],
    };
    expectMalformed(gsubFont([recursive]), "a", /nest deeper than 8/);
  });

  test("a multiple substitution growing the buffer past its cap", () => {
    const growing: TestLookup = {
      type: 2,
      subtables: [
        struct([
          1,
          { offset: coverage([a]) },
          1,
          { offset: struct(list(new Array<number>(5000).fill(a))) },
        ]),
      ],
    };
    expectMalformed(gsubFont([growing]), "a", /past 4096 glyphs/);
  });

  test("lookups doubling the text again and again", () => {
    const doubling: TestLookup = {
      type: 2,
      subtables: [struct([1, { offset: coverage([a]) }, 1, { offset: struct(list([a, a])) }])],
    };
    const lookups = new Array<TestLookup>(20).fill(doubling);
    const font = gsubFont(
      lookups,
      lookups.map((_, index) => index),
    );
    const { error, ms, limitMs } = failure(font, "a");
    expect(error).toBeInstanceOf(MalformedFont);
    expect(ms).toBeLessThan(limitMs);
  });

  test("65535 feature indices naming a feature with 65535 entries of lookup 0 are refused unread", () => {
    // The feature table overlaps the LangSys (its lookup count is the LangSys's feature count), so 65535 entries
    // each fit in a table whose offsets stay 16-bit.
    const out = new ByteWriter();
    out.u32(0x00010000).u16(42).u16(34).u16(10);
    out
      .u16(1)
      .u16(4)
      .u16(1)
      .u16(0)
      .u16(1)
      .u16(8)
      .u16(1)
      .u16(6)
      .i16(x - a)
      .u16(1)
      .u16(1)
      .u16(a);
    out
      .u16(1)
      .tag("ccmp")
      .u16(56 - 34);
    out.u16(1).tag("DFLT").u16(8).u16(4).u16(0);
    out.u16(0).u16(0xffff).u16(65_535);
    for (let index = 0; index < 65_535; index++) out.u16(0);
    expectMalformed(layoutFont({ tables: { GSUB: out.result() } }), "a", /too many lookups/);
  });

  test("4000 repeats of one feature and lookup are read once and work", () => {
    const single = struct([1, { offset: coverage([a]) }, { i16: x - a }]);
    const repeats = new Array<number>(4000).fill(0);
    const gsub = struct([
      { u32: 0x00010000 },
      {
        offset: struct([
          1,
          { tag: "DFLT" },
          { offset: struct([{ offset: struct([0, 0xffff, ...list(repeats)]) }, 0]) },
        ]),
      },
      { offset: struct([1, { tag: "ccmp" }, { offset: struct([0, ...list(repeats)]) }]) },
      { offset: struct([1, { offset: struct([1, 0, 1, { offset: single }]) }]) },
    ]);
    expect(shapeText(layoutFont({ tables: { GSUB: gsub } }), "a").glyphs).toEqual([x]);
  });

  test("an extension pointing to an extension", () => {
    const single = struct([1, { offset: coverage([a]) }, { i16: x - a }]);
    expectMalformed(
      gsubFont([{ type: 7, subtables: [extension(7, extension(1, single))] }]),
      "a",
      /extension of an extension/,
    );
  });

  test("a ligature set of 65535 entries that never match runs out of operations", () => {
    // Every offset is 2: each entry reads the offset array itself as a ligature of a and b, so the table stays small.
    const set = new Uint8Array(2 + 65_535 * 2);
    const view = new DataView(set.buffer);
    view.setUint16(0, 65_535);
    for (let index = 0; index < 65_535; index++) view.setUint16(2 + index * 2, 2);
    const ligature: TestLookup = {
      type: 4,
      subtables: [struct([1, { offset: coverage([a]) }, 1, { offset: set }])],
    };
    expect(b).toBe(2);
    expectMalformed(gsubFont([ligature]), "aa", /operations/);
  });

  test("more than 1024 lookups, more than 64 subtables, a rule of more than 64 glyphs", () => {
    const single: TestLookup = {
      type: 1,
      subtables: [struct([1, { offset: coverage([a]) }, { i16: 0 }])],
    };
    expectMalformed(
      layoutFont({
        tables: {
          GSUB: layoutTable(
            [{ tag: "ccmp", lookups: [0] }],
            new Array<TestLookup>(1025).fill(single),
          ),
        },
      }),
      "a",
      /1025 lookups/,
    );
    const many: TestLookup = {
      type: 1,
      subtables: new Array<Uint8Array>(65).fill(single.subtables[0] ?? new Uint8Array()),
    };
    expectMalformed(gsubFont([many]), "a", /too many subtables/);
    const long: TestLookup = {
      type: 5,
      subtables: [
        struct([
          3,
          65,
          0,
          ...new Array<{ offset: Uint8Array }>(65).fill({ offset: coverage([a]) }),
        ]),
      ],
    };
    expectMalformed(gsubFont([long]), "a", /names 65 glyphs/);
  });
});
