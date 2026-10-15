import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "vitest";
import { joiningTypeOf } from "../src/unicode/arabicJoining.js";
import { bidiClassOf } from "../src/unicode/bidiClass.js";
import { bracketOf } from "../src/unicode/bidiBrackets.js";
import { mirrorOf } from "../src/unicode/bidiMirror.js";
import {
  isDefaultIgnorable,
  isLetter,
  isNonSpacingMark,
  isSpacingMark,
} from "../src/unicode/characterFlags.js";
import { indicPositionalOf, indicSyllabicOf } from "../src/unicode/indicCategory.js";
import { scriptOf } from "../src/unicode/scriptOf.js";
import { ucdVersion } from "../src/unicode/ucdTables.js";

const packageRoot = new URL("../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, packageRoot), "utf8");

test("the tables are Unicode 16.0.0", () => {
  expect(ucdVersion).toBe("16.0.0");
});

test("scripts of known code points", () => {
  expect(scriptOf(0x41)).toBe("Latn");
  expect(scriptOf(0x20)).toBe("Zyyy");
  expect(scriptOf(0x0301)).toBe("Zinh");
  expect(scriptOf(0x0627)).toBe("Arab");
  expect(scriptOf(0x0915)).toBe("Deva");
  expect(scriptOf(0x0964)).toBe("Zyyy");
  expect(scriptOf(0x05d0)).toBe("Hebr");
  expect(scriptOf(0x0e01)).toBe("Thai");
  expect(scriptOf(0x0995)).toBe("Other");
  expect(scriptOf(0x0378)).toBe("Zzzz");
  expect(scriptOf(0x1f600)).toBe("Zyyy");
});

test("bidi classes, the defaults of unassigned code points included", () => {
  expect(bidiClassOf(0x41)).toBe("L");
  expect(bidiClassOf(0x05d0)).toBe("R");
  expect(bidiClassOf(0x0627)).toBe("AL");
  expect(bidiClassOf(0x30)).toBe("EN");
  expect(bidiClassOf(0x0660)).toBe("AN");
  expect(bidiClassOf(0x2b)).toBe("ES");
  expect(bidiClassOf(0x24)).toBe("ET");
  expect(bidiClassOf(0x2c)).toBe("CS");
  expect(bidiClassOf(0x0300)).toBe("NSM");
  expect(bidiClassOf(0x200b)).toBe("BN");
  expect(bidiClassOf(0x0a)).toBe("B");
  expect(bidiClassOf(0x09)).toBe("S");
  expect(bidiClassOf(0x20)).toBe("WS");
  expect(bidiClassOf(0x21)).toBe("ON");
  expect(bidiClassOf(0x202a)).toBe("LRE");
  expect(bidiClassOf(0x202e)).toBe("RLO");
  expect(bidiClassOf(0x2066)).toBe("LRI");
  expect(bidiClassOf(0x2068)).toBe("FSI");
  expect(bidiClassOf(0x2069)).toBe("PDI");
  // Unassigned, but in the Arabic and Hebrew default ranges.
  expect(bidiClassOf(0x07bf)).toBe("AL");
  expect(bidiClassOf(0x05ff)).toBe("R");
  expect(bidiClassOf(0x20cf)).toBe("ET");
});

test("joining types, unlisted marks and format characters transparent", () => {
  expect(joiningTypeOf(0x0628)).toBe("D");
  expect(joiningTypeOf(0x0627)).toBe("R");
  expect(joiningTypeOf(0x0621)).toBe("U");
  expect(joiningTypeOf(0x200d)).toBe("C");
  expect(joiningTypeOf(0x200c)).toBe("U");
  expect(joiningTypeOf(0x064e)).toBe("T");
  expect(joiningTypeOf(0x0301)).toBe("T");
  expect(joiningTypeOf(0x0640)).toBe("C");
  expect(joiningTypeOf(0x41)).toBe("U");
});

test("Indic categories of Devanagari and the characters used with it", () => {
  expect(indicSyllabicOf(0x0915)).toBe("Consonant");
  expect(indicSyllabicOf(0x094d)).toBe("Virama");
  expect(indicSyllabicOf(0x093c)).toBe("Nukta");
  expect(indicSyllabicOf(0x093f)).toBe("Vowel_Dependent");
  expect(indicSyllabicOf(0x0905)).toBe("Vowel_Independent");
  expect(indicSyllabicOf(0x0902)).toBe("Bindu");
  expect(indicSyllabicOf(0x0903)).toBe("Visarga");
  expect(indicSyllabicOf(0x200d)).toBe("Joiner");
  expect(indicSyllabicOf(0x200c)).toBe("Non_Joiner");
  expect(indicSyllabicOf(0x25cc)).toBe("Consonant_Placeholder");
  expect(indicSyllabicOf(0x0995)).toBe("Other");
  expect(indicPositionalOf(0x093f)).toBe("Left");
  expect(indicPositionalOf(0x0940)).toBe("Right");
  expect(indicPositionalOf(0x0947)).toBe("Top");
  expect(indicPositionalOf(0x0941)).toBe("Bottom");
  expect(indicPositionalOf(0x0915)).toBe("NA");
});

test("character flags", () => {
  expect(isNonSpacingMark(0x0301)).toBe(true);
  expect(isNonSpacingMark(0x064e)).toBe(true);
  expect(isNonSpacingMark(0x20dd)).toBe(true);
  expect(isNonSpacingMark(0x0903)).toBe(false);
  expect(isSpacingMark(0x0903)).toBe(true);
  expect(isDefaultIgnorable(0x200d)).toBe(true);
  expect(isDefaultIgnorable(0x200f)).toBe(true);
  expect(isDefaultIgnorable(0xfe0f)).toBe(true);
  expect(isDefaultIgnorable(0xe0100)).toBe(true);
  expect(isDefaultIgnorable(0x41)).toBe(false);
  expect(isLetter(0x0628)).toBe(true);
  expect(isLetter(0x30)).toBe(false);
});

test("brackets and mirrors", () => {
  expect(bracketOf(0x28)).toEqual({ pair: 0x29, opening: true });
  expect(bracketOf(0x29)).toEqual({ pair: 0x28, opening: false });
  expect(bracketOf(0x2329)).toEqual({ pair: 0x232a, opening: true });
  expect(bracketOf(0x3c)).toBeUndefined();
  expect(mirrorOf(0x28)).toBe(0x29);
  expect(mirrorOf(0x3c)).toBe(0x3e);
  expect(mirrorOf(0x3e)).toBe(0x3c);
  expect(mirrorOf(0x41)).toBeUndefined();
});

test("the Unicode notice survives the TypeScript emit of ucdTables.ts", () => {
  const markers = [
    "@license Unicode-3.0",
    "UNICODE LICENSE V3",
    "Copyright © 1991-2024 Unicode, Inc.",
    "provided that either (a) this copyright and permission notice appear with all copies",
    "without prior written authorization of the copyright holder.",
  ];
  const emitted = ts.transpileModule(read("src/unicode/ucdTables.ts"), {
    compilerOptions: { module: ts.ModuleKind.NodeNext, target: ts.ScriptTarget.ES2023 },
    fileName: "ucdTables.ts",
  }).outputText;
  for (const marker of markers) expect(emitted).toContain(marker);
  const licence = read("LICENSE-UNICODE");
  for (const marker of markers.slice(1)) expect(licence).toContain(marker);
  const manifest = JSON.parse(read("package.json")) as { files?: string[] };
  expect(manifest.files).toEqual(["dist", "LICENSE-UNICODE"]);
});
