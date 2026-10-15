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
