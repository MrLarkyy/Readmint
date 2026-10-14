import { expect, test } from "vitest";
import { toLowerSimple, toUpperSimple } from "../src/simpleCase.js";
import { valueOf } from "./evaluateText.js";

/** FNV-1a over the upper and lower mapping of every BMP code unit, two bytes each. */
function tableHash(): { upper: number; lower: number; hash: string } {
  let hash = 0x811c9dc5;
  const feed = (unit: number): void => {
    for (const byte of [unit & 0xff, unit >>> 8]) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  };
  let upper = 0;
  let lower = 0;
  for (let unit = 0; unit <= 0xffff; unit++) {
    const char = String.fromCharCode(unit);
    const upperUnit = toUpperSimple(char).charCodeAt(0);
    const lowerUnit = toLowerSimple(char).charCodeAt(0);
    if (upperUnit !== unit) upper++;
    if (lowerUnit !== unit) lower++;
    feed(upperUnit);
    feed(lowerUnit);
  }
  return { upper, lower, hash: `0x${hash.toString(16)}` };
}

test("the case table is pinned: 309 upper and 300 lower mappings", () => {
  // The hash was computed independently from the simple mappings of the Unicode data (Node 20 and
  // Node 24 agree on these blocks); a changed table is a deliberate, reviewed change.
  expect(tableHash()).toEqual({ upper: 309, lower: 300, hash: "0x6a88816e" });
});

test.each([
  ["abc xyz", "ABC XYZ"],
  ["àéîõü ÿ", "ÀÉÎÕÜ Ÿ"],
  ["ąčďěłńřšťůž ı ſ", "ĄČĎĚŁŃŘŠŤŮŽ I S"],
  ["αβγ ς ϐ µ", "ΑΒΓ Σ Β Μ"],
  ["привет ё ѣ ӏ", "ПРИВЕТ Ё Ѣ Ӏ"],
])("upper-cases %j", (input, expected) => {
  expect(toUpperSimple(input)).toBe(expected);
});

test.each([
  ["ABC XYZ", "abc xyz"],
  ["ÀÉÎÕÜ Ÿ", "àéîõü ÿ"],
  ["ĄČĎĚŁŃŘŠŤŮŽ İ", "ąčďěłńřšťůž i"],
  ["ΑΒΓ ΟΔΟΣ", "αβγ οδοσ"],
  ["ПРИВЕТ Ё Ӏ", "привет ё ӏ"],
])("lower-cases %j", (input, expected) => {
  expect(toLowerSimple(input)).toBe(expected);
});

test("nothing expands and the length is kept", () => {
  for (const text of ["ß", "ŉ", "ΐ", "ΰ", "İ", "ﬃ"]) {
    expect(toUpperSimple(text).length).toBe(text.length);
    expect(toLowerSimple(text).length).toBe(text.length);
  }
  expect(toUpperSimple("ß")).toBe("ß");
  expect(toUpperSimple("ﬃ")).toBe("ﬃ");
});

test("code points outside the five blocks are unchanged, whatever the engine's Unicode version", () => {
  // Node 20 and Node 24 / Chromium disagree on these with toUpperCase.
  expect(toUpperSimple("ƛ")).toBe("ƛ");
  expect(toUpperSimple("ɤ")).toBe("ɤ");
  expect(toLowerSimple("ꟜꟋ")).toBe("ꟜꟋ");
  expect(toUpperSimple("ǆ ɐ ḁ ⓐ ａ")).toBe("ǆ ɐ ḁ ⓐ ａ");
  expect(toUpperSimple("\u{10428}\u{1F600}")).toBe("\u{10428}\u{1F600}");
  expect(toLowerSimple("\uD800x")).toBe("\uD800x");
});

test("the upper and lower filters use the table", () => {
  expect(valueOf("{{ s | upper }}", { s: "straße ƛ" })).toBe("STRAßE ƛ");
  expect(valueOf("{{ s | lower }}", { s: "İSTANBUL" })).toBe("istanbul");
});
