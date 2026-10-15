import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readmintTestSymbols, testSymbols } from "./readmintTestSymbols.js";
import { fontsDir, parse, sameBytes } from "./testFonts.js";

test("the committed ReadmintTestSymbols.ttf is what the builder makes (rebuild it from readmintTestSymbols())", () => {
  const committed = new Uint8Array(readFileSync(join(fontsDir, "ReadmintTestSymbols.ttf")));
  expect(sameBytes(committed, readmintTestSymbols())).toBe(true);
});

test("the symbols font covers what Montserrat lacks, one character above the BMP", () => {
  const font = parse(readmintTestSymbols());
  expect(font.familyName).toBe("Readmint Test Symbols");
  expect(font.fsType).toBe(0);
  for (const codePoint of Object.values(testSymbols)) expect(font.glyphFor(codePoint)).not.toBe(0);
  expect(font.glyphFor(0x41)).toBe(0);
});

test("the font says it is OFL-1.1 work of the Readmint contributors (copyright, licence, licence URL records)", () => {
  const name = parse(readmintTestSymbols()).table("name");
  if (name === undefined) throw new Error("no name table");
  const view = new DataView(name.buffer, name.byteOffset, name.byteLength);
  const records = new Map<number, string>();
  for (let index = 0; index < view.getUint16(2); index++) {
    const record = 6 + index * 12;
    const start = view.getUint16(4) + view.getUint16(record + 10);
    let text = "";
    for (let at = 0; at < view.getUint16(record + 8); at += 2) {
      text += String.fromCharCode(view.getUint16(start + at));
    }
    records.set(view.getUint16(record + 6), text);
  }
  expect(records.get(0)).toBe("Copyright 2026 The Readmint Contributors");
  expect(records.get(13)).toContain("SIL Open Font License, Version 1.1");
  expect(records.get(14)).toBe("https://openfontlicense.org");
});
