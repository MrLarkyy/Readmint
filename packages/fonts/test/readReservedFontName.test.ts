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
const fontWith = (names: Readonly<Record<number, string>>) =>
  parse(buildTestFont({ family: "Rfn", glyphs, names }));

const rfnCopyright = 'Copyright 2026 The Rfn Authors, with Reserved Font Name "Rfn".';
const otherLicence = "Licensed under the Example Font Licence 2.0.";

describe("the Reserved Font Name hint of a name table", () => {
  test("a copyright naming a Reserved Font Name in an OFL font is stated-ofl", () => {
    expect(fontWith({ 0: rfnCopyright }).reservedFontName).toBe("stated-ofl");
  });

  test("the statement in the licence description (name 13) counts too", () => {
    const description = `${rfnCopyright} This Font Software is licensed under the SIL Open Font License, Version 1.1.`;
    expect(fontWith({ 13: description }).reservedFontName).toBe("stated-ofl");
  });

  test("a statement without an OFL licence record is only stated", () => {
    const font = fontWith({ 0: rfnCopyright, 13: otherLicence, 14: "https://example.org/licence" });
    expect(font.reservedFontName).toBe("stated");
  });

  test("the OFL text itself, which defines the term, names no Reserved Font Name", () => {
    const definitions =
      '"Reserved Font Name" refers to any names specified as such after the copyright statement(s). ' +
      "No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written " +
      "permission is granted by the corresponding Copyright Holder.";
    expect(fontWith({ 13: definitions }).reservedFontName).toBe("none");
  });

  test.each([
    "Copyright (c) <dates>, <Copyright Holder> (<URL|email>), with Reserved Font Name <Reserved Font Name>.",
    'Copyright (c) 2026, with Reserved Font Name "<Reserved Font Name>".',
    "Copyright 2026, with Reserved Font Name",
  ])(
    "the OFL template placeholder or a phrase naming nothing is not a statement: %s",
    (copyright) => {
      expect(fontWith({ 0: copyright }).reservedFontName).toBe("none");
    },
  );

  test("case, plural and line breaks do not hide a statement", () => {
    expect(fontWith({ 0: "COPYRIGHT 2026, WITH RESERVED FONT NAME RFN." }).reservedFontName).toBe(
      "stated-ofl",
    );
    expect(
      fontWith({ 0: "Copyright 2026, with Reserved\r\nFont  Names “Rfn” and “Rfn Sans”." })
        .reservedFontName,
    ).toBe("stated-ofl");
  });

  test("the default test font and every committed font state no Reserved Font Name", () => {
    expect(fontWith({}).reservedFontName).toBe("none");
    for (const bytes of [
      montserrat.ttf,
      montserrat.otf,
      montserrat.woff,
      montserrat.woff2,
      noto.arabic,
      noto.devanagari,
      readmintTestSymbols(),
    ]) {
      expect(parse(bytes).reservedFontName).toBe("none");
    }
  });

  test("a truncated name table is no hint, never a throw", () => {
    const table = new ByteWriter().u16(0).u16(100).u16(6).result();
    expect(readReservedFontName(new SfntReader(table), { offset: 0, length: table.length })).toBe(
      "none",
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
    expect(readReservedFontName(reader, name)).toBe("none");
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
