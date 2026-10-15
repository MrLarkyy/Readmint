/**
 * Writes src/unicode/ucdTables.ts (the Unicode properties shaping, bidi and normalization need, as compact range and
 * pair tables), test/data/BidiCharacterTest-sample.txt and test/data/NormalizationTest-sample.txt from the Unicode
 * Character Database 16.0.0. The renderer must not take these
 * properties from RegExp property escapes or Intl: their Unicode version differs between Node and browser builds.
 *
 * Run from the repository root with Node 24, after downloading the files below (each checked against its sha256)
 * from https://www.unicode.org/Public/16.0.0/ucd/ (DerivedBidiClass.txt lives in extracted/) into one directory:
 * `node packages/fonts/scripts/generateUnicodeTables.ts <that directory>`, then
 * `pnpm exec prettier --write packages/fonts/src/unicode/ucdTables.ts`.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = "16.0.0";
const sources = {
  "ArabicShaping.txt": "764f420cedfc8b43d9fec251c957a5d55fc45d40f6573f162990ed1dce7e36e0",
  "BidiBrackets.txt": "b8f32554c6f658821fb0ee742d21c5b1f2086b9bf13071fed04894b022f93d67",
  "BidiCharacterTest.txt": "d04a51a90052dcd71c4e91ee5b3a9d973ee35c12406b5a99875ac8163c8f2804",
  "BidiMirroring.txt": "d7afdadd1bbd66f5a663ac0e8f7958f18fd9491fc0bc59ec5877cb82db71db7d",
  "CompositionExclusions.txt": "89e83cf9cc8bef6c1f8bf77e42cf6f0341dfa42e66261f4dbe9b492e7a23c8ee",
  "DerivedBidiClass.txt": "71ed943a49c58568d8d92e80ecc2ba2f06e62aee9c8ebb0e6e8bd2c3ed8b180e",
  "DerivedCoreProperties.txt": "39d35161f2954497f69e08bdb9e701493f476a3d30222de20028feda36c1dabd",
  "IndicPositionalCategory.txt": "cbb9e2193e26c9b3d595a8f0ff4fd2ad956482309143ceb4ce5469c19f14feba",
  "IndicSyllabicCategory.txt": "615f1b92ba7ec76e18c5b5c05d2e1836e4b98bc791eb9e27946c7621fc047ae7",
  "NormalizationTest.txt": "d811971453e7075e1ad56fb1b301eece5aa80757b81f6156e74a1bfb3ae5ceb1",
  "Scripts.txt": "9e88f0a677df47311106340be8ede2ecdacd9c1c931831218d2be6d5508e0039",
  "UnicodeData.txt": "ff58e5823bd095166564a006e47d111130813dcf8bf234ef79fa51a870edb48f",
} as const;

type Source = keyof typeof sources;

const codeSpace = 0x110000;
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const sampleLines = 2000;
/** Every n-th test of NormalizationTest.txt parts 1 and 2 goes into its sample; the other parts go in whole. */
const normalizationStep = 12;
const maxSampleBytes = 200_000;
/** The longest full canonical decomposition the normalizer allows for (UAX #15 keeps it at four). */
const maxDecompositionLength = 4;

/** Scripts with a shaper or an OpenType script tag of their own; every other script is `Other`. */
const scriptCodes: Readonly<Record<string, string>> = {
  Unknown: "Zzzz",
  Common: "Zyyy",
  Inherited: "Zinh",
  Latin: "Latn",
  Greek: "Grek",
  Cyrillic: "Cyrl",
  Armenian: "Armn",
  Hebrew: "Hebr",
  Arabic: "Arab",
  Devanagari: "Deva",
  Georgian: "Geor",
  Thai: "Thai",
  Han: "Hani",
  Hiragana: "Kana",
  Katakana: "Kana",
  Hangul: "Hang",
};
const scriptValues = [...new Set([...Object.values(scriptCodes), "Other"])];

const bidiLongNames: Readonly<Record<string, string>> = {
  Left_To_Right: "L",
  Right_To_Left: "R",
  Arabic_Letter: "AL",
  European_Number: "EN",
  European_Separator: "ES",
  European_Terminator: "ET",
  Arabic_Number: "AN",
  Common_Separator: "CS",
  Nonspacing_Mark: "NSM",
  Boundary_Neutral: "BN",
  Paragraph_Separator: "B",
  Segment_Separator: "S",
  White_Space: "WS",
  Other_Neutral: "ON",
};
const bidiValues = [
  "L",
  "R",
  "AL",
  "EN",
  "ES",
  "ET",
  "AN",
  "CS",
  "NSM",
  "BN",
  "B",
  "S",
  "WS",
  "ON",
  "LRE",
  "LRO",
  "RLE",
  "RLO",
  "PDF",
  "LRI",
  "RLI",
  "FSI",
  "PDI",
];
/** X: not listed in ArabicShaping.txt (T for Mn, Me and Cf, else U: derived at run time from the flags). */
const joiningValues = ["X", "U", "L", "R", "D", "C", "T"];

const directory = process.argv[2];
if (directory === undefined) {
  throw new Error("usage: node packages/fonts/scripts/generateUnicodeTables.ts <ucd directory>");
}

function read(name: Source): string[] {
  const bytes = readFileSync(join(directory ?? "", name));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== sources[name]) throw new Error(`${name}: sha256 ${digest} is not the pinned one`);
  const text = bytes.toString("utf8");
  if (
    !text.startsWith(`# ${name.replace(".txt", "")}-${version}.txt`) &&
    name !== "UnicodeData.txt"
  ) {
    throw new Error(`${name} is not Unicode ${version}`);
  }
  return text.split("\n");
}

/** Data fields of a UCD line (comment cut, fields trimmed), undefined for a blank or comment line. */
function fields(line: string): string[] | undefined {
  const data = line.split("#")[0]?.trim() ?? "";
  return data === "" ? undefined : data.split(";").map((field) => field.trim());
}

function range(text: string): [number, number] {
  const [first = "", last] = text.split("..");
  const start = Number.parseInt(first, 16);
  return [start, last === undefined ? start : Number.parseInt(last, 16)];
}

function fill(values: Uint8Array, text: string, value: number): void {
  const [start, end] = range(text);
  values.fill(value, start, end + 1);
}

function index(list: readonly string[], name: string): number {
  const found = list.indexOf(name);
  if (found < 0) throw new Error(`unknown value ${name}`);
  return found;
}

/** General categories from UnicodeData.txt, ranges (`<..., First>` / `<..., Last>`) expanded; unassigned: Cn. */
function generalCategories(): string[] {
  const categories = new Array<string>(codeSpace).fill("Cn");
  let first: number | undefined;
  for (const line of read("UnicodeData.txt")) {
    const parts = line.split(";");
    if (parts.length < 3) continue;
    const codePoint = Number.parseInt(parts[0] ?? "", 16);
    const name = parts[1] ?? "";
    const category = parts[2] ?? "Cn";
    if (name.endsWith(", First>")) {
      first = codePoint;
      continue;
    }
    const start = name.endsWith(", Last>") && first !== undefined ? first : codePoint;
    categories.fill(category, start, codePoint + 1);
    first = undefined;
  }
  return categories;
}

function scripts(): Uint8Array {
  const values = new Uint8Array(codeSpace).fill(index(scriptValues, "Zzzz"));
  for (const line of read("Scripts.txt")) {
    const parts = fields(line);
    if (parts === undefined) continue;
    const code = scriptCodes[parts[1] ?? ""] ?? "Other";
    fill(values, parts[0] ?? "", index(scriptValues, code));
  }
  return values;
}

function bidiClasses(): Uint8Array {
  const values = new Uint8Array(codeSpace);
  const lines = read("DerivedBidiClass.txt");
  for (const line of lines) {
    const missing = /^# @missing: ([0-9A-F.]+); (\w+)/.exec(line);
    if (missing === null) continue;
    fill(values, missing[1] ?? "", index(bidiValues, bidiLongNames[missing[2] ?? ""] ?? ""));
  }
  for (const line of lines) {
    const parts = fields(line);
    if (parts !== undefined) fill(values, parts[0] ?? "", index(bidiValues, parts[1] ?? ""));
  }
  return values;
}

/** ArabicShaping.txt; an unlisted Mn, Me or Cf is transparent (the file's own rule), anything else U. */
function joiningTypes(): Uint8Array {
  const values = new Uint8Array(codeSpace);
  for (const line of read("ArabicShaping.txt")) {
    const parts = fields(line);
    if (parts !== undefined) fill(values, parts[0] ?? "", index(joiningValues, parts[2] ?? ""));
  }
  return values;
}

/**
 * An Indic category table, kept for the scripts with an Indic shaper (Devanagari) and the Common and Inherited
 * characters used with them (digits, placeholders, joiners); every other code point is the first value.
 */
function indicTable(
  source: Source,
  defaultValue: string,
  scriptOf: Uint8Array,
): { values: Uint8Array; names: string[] } {
  const names = [defaultValue];
  const values = new Uint8Array(codeSpace);
  const kept = new Set(["Deva", "Zyyy", "Zinh"].map((code) => index(scriptValues, code)));
  for (const line of read(source)) {
    const parts = fields(line);
    if (parts === undefined) continue;
    const name = parts[1] ?? "";
    if (!names.includes(name)) names.push(name);
    const [start, end] = range(parts[0] ?? "");
    for (let codePoint = start; codePoint <= end; codePoint++) {
      if (kept.has(scriptOf[codePoint] ?? -1)) values[codePoint] = names.indexOf(name);
    }
  }
  return { values, names };
}

/** Bit 1: Mn or Me; 2: Mc; 4: Default_Ignorable_Code_Point; 16: Cf. */
function flags(categories: readonly string[]): Uint8Array {
  const values = new Uint8Array(codeSpace);
  for (let codePoint = 0; codePoint < codeSpace; codePoint++) {
    const category = categories[codePoint] ?? "Cn";
    let value = 0;
    if (category === "Mn" || category === "Me") value |= 1;
    if (category === "Mc") value |= 2;
    if (category === "Cf") value |= 16;
    values[codePoint] = value;
  }
  for (const line of read("DerivedCoreProperties.txt")) {
    const parts = fields(line);
    if (parts?.[1] !== "Default_Ignorable_Code_Point") continue;
    const [start, end] = range(parts[0] ?? "");
    for (let codePoint = start; codePoint <= end; codePoint++) {
      values[codePoint] = (values[codePoint] ?? 0) | 4;
    }
  }
  return values;
}

/** Varints: five bits per character, least significant first; a character above 31 says another one follows. */
function varint(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`varint ${String(value)}`);
  let text = "";
  let rest = value;
  do {
    const digit = rest % 32;
    rest = Math.floor(rest / 32);
    text += alphabet.charAt(digit + (rest > 0 ? 32 : 0));
  } while (rest > 0);
  return text;
}

function zigzag(value: number): number {
  return value < 0 ? -value * 2 - 1 : value * 2;
}

/** Runs of equal values as (start minus the previous start, value) varint pairs, from code point 0. */
function runs(values: Uint8Array): string {
  let text = "";
  let previousStart = 0;
  let previousValue = -1;
  for (let codePoint = 0; codePoint < codeSpace; codePoint++) {
    const value = values[codePoint] ?? 0;
    if (value === previousValue) continue;
    text += varint(codePoint - previousStart) + varint(value);
    previousStart = codePoint;
    previousValue = value;
  }
  return text;
}

/** Ascending pairs as (code point minus the previous one, zigzag(other minus code point)) varint pairs. */
function pairs(entries: readonly (readonly [number, number])[]): string {
  let text = "";
  let previous = 0;
  for (const [codePoint, other] of [...entries].sort((left, right) => left[0] - right[0])) {
    text += varint(codePoint - previous) + varint(zigzag(other - codePoint));
    previous = codePoint;
  }
  return text;
}

function brackets(): string {
  const opening: [number, number][] = [];
  for (const line of read("BidiBrackets.txt")) {
    const parts = fields(line);
    if (parts?.[2] === "o") {
      opening.push([Number.parseInt(parts[0] ?? "", 16), Number.parseInt(parts[1] ?? "", 16)]);
    }
  }
  return pairs(opening);
}

function mirrors(): string {
  const entries: [number, number][] = [];
  for (const line of read("BidiMirroring.txt")) {
    const parts = fields(line);
    if (parts !== undefined) {
      entries.push([Number.parseInt(parts[0] ?? "", 16), Number.parseInt(parts[1] ?? "", 16)]);
    }
  }
  return pairs(entries);
}

/**
 * Every n-th test of BidiCharacterTest.txt and every test with an auto paragraph direction (the file has few), so the
 * sample covers the whole file the same way on every run.
 */
function bidiSample(): string {
  const tests = read("BidiCharacterTest.txt").filter((line) => fields(line) !== undefined);
  const step = Math.floor(tests.length / sampleLines);
  const sample = tests.filter(
    (line, position) =>
      (position % step === 0 && position / step < sampleLines) || fields(line)?.[1] === "2",
  );
  return [
    `# Every ${String(step)}th test and every auto-direction test of BidiCharacterTest-${version}.txt`,
    `# (sha256 ${sources["BidiCharacterTest.txt"]}),`,
    "# written by packages/fonts/scripts/generateUnicodeTables.ts. Copyright Unicode, Inc.; Unicode License V3,",
    "# see packages/fonts/LICENSE-UNICODE. Fields: code points; paragraph direction (0 LTR, 1 RTL, 2 auto);",
    "# resolved paragraph level; levels (x: removed by X9); visual order of the kept characters.",
    ...sample,
    "",
  ].join("\n");
}

/** Canonical_Combining_Class (UnicodeData.txt field 3); the `<..., First>` ranges are all class 0. */
function combiningClasses(): Uint8Array {
  const values = new Uint8Array(codeSpace);
  for (const line of read("UnicodeData.txt")) {
    const parts = line.split(";");
    if (parts.length < 6) continue;
    values[Number.parseInt(parts[0] ?? "", 16)] = Number.parseInt(parts[3] ?? "0", 10);
  }
  return values;
}

/** Canonical decompositions (UnicodeData.txt field 5 without a `<tag>`): one or two code points each. */
function canonicalDecompositions(): Map<number, number[]> {
  const decompositions = new Map<number, number[]>();
  for (const line of read("UnicodeData.txt")) {
    const parts = line.split(";");
    const mapping = parts[5] ?? "";
    if (mapping === "" || mapping.startsWith("<")) continue;
    const codePoints = mapping.split(" ").map((text) => Number.parseInt(text, 16));
    if (codePoints.length > 2) throw new Error(`${parts[0] ?? ""}: decomposition of more than two`);
    decompositions.set(Number.parseInt(parts[0] ?? "", 16), codePoints);
  }
  return decompositions;
}

function fullDecompositionLength(codePoint: number, decompositions: Map<number, number[]>): number {
  const mapping = decompositions.get(codePoint);
  if (mapping === undefined) return 1;
  return mapping.reduce((sum, part) => sum + fullDecompositionLength(part, decompositions), 0);
}

/**
 * Canonical decompositions as varint triples (code point minus the previous one, zigzag(first minus code point),
 * second times two plus the Full_Composition_Exclusion bit; second 0 for a singleton). Full_Composition_Exclusion
 * (UAX #15): CompositionExclusions.txt, singletons, and non-starter decompositions (the character or its first part
 * has a combining class).
 */
function decompositionTriples(classes: Uint8Array): string {
  const decompositions = canonicalDecompositions();
  const excluded = new Set<number>();
  for (const line of read("CompositionExclusions.txt")) {
    const parts = fields(line);
    if (parts !== undefined) excluded.add(range(parts[0] ?? "")[0]);
  }
  let text = "";
  let previous = 0;
  const sorted = [...decompositions].sort((left, right) => left[0] - right[0]);
  for (const [codePoint, [first = 0, second = 0]] of sorted) {
    if (fullDecompositionLength(codePoint, decompositions) > maxDecompositionLength) {
      throw new Error(
        `${codePoint.toString(16)}: full decomposition longer than the normalizer allows`,
      );
    }
    const exclusion =
      excluded.has(codePoint) ||
      second === 0 ||
      (classes[codePoint] ?? 0) !== 0 ||
      (classes[first] ?? 0) !== 0;
    text += varint(codePoint - previous) + varint(zigzag(first - codePoint));
    text += varint(second * 2 + (exclusion ? 1 : 0));
    previous = codePoint;
  }
  return text;
}

/**
 * NormalizationTest.txt without comments: parts 0, 3, 4 and 5 whole, every n-th test of parts 1 (character by
 * character) and 2 (canonical order), so the sample covers the whole file the same way on every run.
 */
function normalizationSample(): string {
  const kept: string[] = [];
  let part = "";
  let position = 0;
  for (const line of read("NormalizationTest.txt")) {
    const marker = /^(@Part\d)/.exec(line);
    if (marker !== null) {
      part = marker[1] ?? "";
      position = 0;
      kept.push(part);
      continue;
    }
    const parts = fields(line);
    if (parts === undefined) continue;
    const sampled = part === "@Part1" || part === "@Part2";
    if (!sampled || position % normalizationStep === 0)
      kept.push(`${parts.slice(0, 5).join(";")};`);
    position++;
  }
  const sample = [
    `# Parts 0, 3, 4 and 5 and every ${String(normalizationStep)}th test of parts 1 and 2 of NormalizationTest-${version}.txt`,
    `# (sha256 ${sources["NormalizationTest.txt"]}), comments removed,`,
    "# written by packages/fonts/scripts/generateUnicodeTables.ts. Copyright Unicode, Inc.; Unicode License V3,",
    "# see packages/fonts/LICENSE-UNICODE. Fields: source; NFC; NFD; NFKC; NFKD (code points).",
    ...kept,
    "",
  ].join("\n");
  if (sample.length > maxSampleBytes)
    throw new Error(`normalization sample of ${String(sample.length)} bytes`);
  return sample;
}

function list(names: readonly string[]): string {
  return `[${names.map((name) => JSON.stringify(name)).join(", ")}]`;
}

const licence = readFileSync(new URL("../LICENSE-UNICODE", import.meta.url), "utf8")
  .split("\n")
  .slice(3)
  .map((line) => ` *${line === "" ? "" : ` ${line}`}`)
  .join("\n")
  .trimEnd();

const categories = generalCategories();
const scriptOf = scripts();
const syllabic = indicTable("IndicSyllabicCategory.txt", "Other", scriptOf);
const positional = indicTable("IndicPositionalCategory.txt", "NA", scriptOf);
const classes = combiningClasses();
const tables = `/*!
 * @license Unicode-3.0 for the Unicode Character Database data below; full text also in LICENSE-UNICODE.
 *
 * Generated by packages/fonts/scripts/generateUnicodeTables.ts from the Unicode Character Database ${version}
 * (Scripts, DerivedBidiClass, BidiBrackets, BidiMirroring, ArabicShaping, IndicSyllabicCategory,
 * IndicPositionalCategory, DerivedCoreProperties, UnicodeData, CompositionExclusions). Do not edit by hand.
 *
${licence}
 */

export const ucdVersion = "${version}";

/** Runs: varint pairs (start minus the previous start, value index); see RangeTable. */
export const scriptValues = ${list(scriptValues)} as const;
export const scriptRuns =
  "${runs(scriptOf)}";

export const bidiClassValues = ${list(bidiValues)} as const;
export const bidiClassRuns =
  "${runs(bidiClasses())}";

export const joiningValues = ${list(joiningValues)} as const;
export const joiningRuns =
  "${runs(joiningTypes())}";

export const indicSyllabicValues = ${list(syllabic.names)} as const;
export const indicSyllabicRuns =
  "${runs(syllabic.values)}";

export const indicPositionalValues = ${list(positional.names)} as const;
export const indicPositionalRuns =
  "${runs(positional.values)}";

/** Bit 1: Mn or Me; 2: Mc; 4: Default_Ignorable_Code_Point; 16: Cf. */
export const flagRuns =
  "${runs(flags(categories))}";

/** Opening brackets: varint pairs (code point minus the previous one, zigzag(closing minus opening)). */
export const bracketPairs =
  "${brackets()}";

/** Bidi_Mirroring_Glyph: varint pairs (code point minus the previous one, zigzag(mirror minus code point)). */
export const mirrorPairs =
  "${mirrors()}";

/** Canonical_Combining_Class: runs of the class itself (0-240). */
export const combiningClassRuns =
  "${runs(classes)}";

/**
 * Canonical decompositions: varint triples (code point minus the previous one, zigzag(first minus code point),
 * second times two plus 1 when Full_Composition_Exclusion; second 0 for a singleton). Hangul is algorithmic.
 */
export const decompositionTriples =
  "${decompositionTriples(classes)}";
`;

writeFileSync(new URL("../src/unicode/ucdTables.ts", import.meta.url), tables);
writeFileSync(new URL("../test/data/BidiCharacterTest-sample.txt", import.meta.url), bidiSample());
writeFileSync(
  new URL("../test/data/NormalizationTest-sample.txt", import.meta.url),
  normalizationSample(),
);
