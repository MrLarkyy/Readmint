import { describe, expect, test } from "vitest";
import { loadScale } from "../../../test-support/loadScale.js";
import { ByteWriter } from "../src/ByteWriter.js";
import { readFamilyName } from "../src/readFamilyName.js";
import { maxNameCodeUnits, readNameStrings } from "../src/readNameStrings.js";
import { readReservedFontName } from "../src/readReservedFontName.js";
import { SfntReader } from "../src/SfntReader.js";
import { buildTestFont } from "./buildTestFont.js";
import { readmintTestSymbols } from "./readmintTestSymbols.js";
import { montserrat, noto, parse, sameBytes } from "./testFonts.js";

const glyphs = [{ advance: 500 }, { codePoints: [0x41], advance: 600 }];
const fontWith = (names: Readonly<Record<number, string | null>>) =>
  parse(buildTestFont({ family: "Rfn", glyphs, names }));

const rfnCopyright = 'Copyright 2026 The Rfn Authors, with Reserved Font Name "Rfn".';
const otherLicence = "Licensed under the Example Font Licence 2.0.";

describe("the Reserved Font Name hint of a name table", () => {
  test("a copyright naming a Reserved Font Name states one", () => {
    expect(fontWith({ 0: rfnCopyright }).reservedFontName).toBe(true);
  });

  test("the statement in the licence description (name 13) counts too", () => {
    const description = `${rfnCopyright} This Font Software is licensed under the SIL Open Font License, Version 1.1.`;
    expect(fontWith({ 13: description }).reservedFontName).toBe(true);
  });

  test("a statement counts whatever licence the font names, also without licence records", () => {
    const other = fontWith({
      0: rfnCopyright,
      13: otherLicence,
      14: "https://example.org/licence",
    });
    expect(other.reservedFontName).toBe(true);
    expect(fontWith({ 0: rfnCopyright, 13: null, 14: null }).reservedFontName).toBe(true);
  });

  test("the licence URL (name 14) is not read for a statement", () => {
    expect(fontWith({ 14: rfnCopyright }).reservedFontName).toBe(false);
  });

  test("the OFL text itself, which defines the term, names no Reserved Font Name", () => {
    const definitions =
      '"Reserved Font Name" refers to any names specified as such after the copyright statement(s). ' +
      "No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written " +
      "permission is granted by the corresponding Copyright Holder.";
    expect(fontWith({ 13: definitions }).reservedFontName).toBe(false);
  });

  test.each([
    "Copyright (c) <dates>, <Copyright Holder> (<URL|email>), with Reserved Font Name <Reserved Font Name>.",
    'Copyright (c) 2026, with Reserved Font Name "<Reserved Font Name>".',
    "Copyright 2026, with Reserved Font Name",
  ])(
    "the OFL template placeholder or a phrase naming nothing is not a statement: %s",
    (copyright) => {
      expect(fontWith({ 0: copyright }).reservedFontName).toBe(false);
    },
  );

  test("case, plural and line breaks do not hide a statement", () => {
    expect(fontWith({ 0: "COPYRIGHT 2026, WITH RESERVED FONT NAME RFN." }).reservedFontName).toBe(
      true,
    );
    expect(
      fontWith({ 0: "Copyright 2026, with Reserved\r\nFont  Names “Rfn” and “Rfn Sans”." })
        .reservedFontName,
    ).toBe(true);
  });

  test("a renamed fork keeping the upstream copyright states no Reserved Font Name it uses", () => {
    const upstream = 'Copyright 2026 The Rfn Authors, with Reserved Font Name "Rfn".';
    const fork = (names: Readonly<Record<number, string | null>>, family: string) =>
      parse(buildTestFont({ family, glyphs, names }));
    expect(fork({ 0: upstream }, "Forked Sans").reservedFontName).toBe(false);
    expect(fork({ 0: upstream, 16: "Forked Display" }, "Rfn").reservedFontName).toBe(true);
    expect(fork({ 0: upstream }, "Rfn Mono").reservedFontName).toBe(true);
    expect(fork({ 0: upstream }, "RFN").reservedFontName).toBe(true);
    const several = 'with Reserved Font Names "Rfn" and "Rfn Sans".';
    expect(fork({ 0: several }, "Forked").reservedFontName).toBe(false);
    expect(fork({ 0: several }, "Rfn Sans").reservedFontName).toBe(true);
  });

  test.each([
    "Copyright 2026 The Authors, with Reserved Font Name: Rfn",
    'Copyright 2026, with Reserved Font Name: "Rfn" for the original version.',
    "Copyright 2026, with Reserved Font Name Rfn\r\nCopyright 2027 Other Authors.",
    "Copyright 2026, with Reserved Font Name Rfn and trailing words",
  ])("trailing words, a colon or a following line do not hide a used name: %s", (copyright) => {
    expect(fontWith({ 0: copyright }).reservedFontName).toBe(true);
    const fork = parse(buildTestFont({ family: "Forked Sans", glyphs, names: { 0: copyright } }));
    expect(fork.reservedFontName).toBe(false);
  });

  test("an unquoted name used by a wider family name counts as used, a disjoint fork does not", () => {
    const font = (family: string, copyright: string) =>
      parse(buildTestFont({ family, glyphs, names: { 0: copyright } })).reservedFontName;
    expect(font("Rfn Mono", "with Reserved Font Name Rfn and trailing words")).toBe(true);
    expect(font("Source Sans Pro", "with Reserved Font Name Source All Rights Reserved")).toBe(
      true,
    );
    expect(font("Forked Sans", "with Reserved Font Name Rfn")).toBe(false);
    expect(font("Forked Sans", "with Reserved Font Name Rfn and trailing words")).toBe(false);
  });

  test.each([
    'with Reserved Font Names "Alpha", "Beta", and "Gamma".',
    'with Reserved Font Names "Alpha" & "Gamma".',
    'with Reserved Font Names "Alpha" / "Gamma".',
    'with Reserved Font Names "Alpha" and Gamma.',
  ])("any separator after a quoted name keeps the later names: %s", (copyright) => {
    const font = (family: string) =>
      parse(buildTestFont({ family, glyphs, names: { 0: copyright } })).reservedFontName;
    expect(font("Gamma")).toBe(true);
    expect(font("Alpha")).toBe(true);
    expect(font("Forked Sans")).toBe(false);
  });

  test("a statement whose names cannot be read counts as used", () => {
    const vague = (copyright: string) =>
      parse(buildTestFont({ family: "Forked", glyphs, names: { 0: copyright } }));
    expect(vague('with Reserved Font Name "".').reservedFontName).toBe(true);
    expect(vague("with Reserved Font Name Rfn, , Other.").reservedFontName).toBe(true);
  });

  test("the default test font and every committed font state no Reserved Font Name", () => {
    expect(fontWith({}).reservedFontName).toBe(false);
    for (const bytes of [
      montserrat.ttf,
      montserrat.otf,
      montserrat.woff,
      montserrat.woff2,
      noto.arabic,
      noto.arabicMarks,
      noto.devanagari,
      readmintTestSymbols(),
    ]) {
      expect(parse(bytes).reservedFontName).toBe(false);
    }
  });

  test("a truncated name table is no hint, never a throw", () => {
    const table = new ByteWriter().u16(0).u16(100).u16(6).result();
    expect(readReservedFontName(new SfntReader(table), { offset: 0, length: table.length })).toBe(
      false,
    );
  });

  test("65535 records pointing at one 64 KB string are read within the decode cap", () => {
    // Storage starts right after the header, so every record's 65534-byte string overlaps the record array.
    const count = 65_535;
    const table = new ByteWriter(6 + count * 12).u16(0).u16(count).u16(6);
    for (let index = 0; index < count; index++) {
      table.u16(3).u16(1).u16(0x409).u16(0).u16(65_534).u16(0);
    }
    const bytes = table.result();
    const reader = new SfntReader(bytes);
    const name = { offset: 0, length: bytes.length };
    const started = performance.now();
    expect(readReservedFontName(reader, name)).toBe(false);
    const strings = readNameStrings(reader, name, [0]);
    expect(performance.now() - started).toBeLessThan(1000 * loadScale());
    expect(strings).toHaveLength(Math.floor(maxNameCodeUnits / 32_767));
  });
});

describe("name strings shared with the family name", () => {
  test("the typographic family (16) wins over the family (1), as before", () => {
    expect(fontWith({ 16: "Rfn Display" }).familyName).toBe("Rfn Display");
    expect(fontWith({}).familyName).toBe("Rfn");
    expect(parse(montserrat.ttf).familyName).toBe("Montserrat");
    expect(parse(noto.arabic).familyName).toBe("Noto Naskh Arabic");
  });

  test("a name table the family reader finds truncated still fails the font", () => {
    const table = new ByteWriter().u16(0).u16(100).u16(6).result();
    expect(() =>
      readFamilyName(new SfntReader(table), { offset: 0, length: table.length }),
    ).toThrow("font name table is truncated");
  });

  test("names given as they are by default leave the font byte for byte the same", () => {
    const plain = buildTestFont({ family: "Rfn", glyphs });
    expect(sameBytes(buildTestFont({ family: "Rfn", glyphs, names: {} }), plain)).toBe(true);
    expect(
      sameBytes(buildTestFont({ family: "Rfn", glyphs, names: { 1: "Rfn", 2: "Regular" } }), plain),
    ).toBe(true);
  });
});
