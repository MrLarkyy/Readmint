import { describe, expect, test } from "vitest";
import { moveModifierMarks } from "../src/moveModifierMarks.js";
import {
  maxReorderedMarks,
  normalizeCharacters,
  normalizeText,
} from "../src/normalizeCharacters.js";
import { decompositionOf } from "../src/unicode/canonicalDecomposition.js";
import { combiningClassOf } from "../src/unicode/combiningClass.js";
import { isModifierCombiningMark } from "../src/unicode/modifierCombiningMark.js";
import { normalizeNfc } from "../src/index.js";

/** A font with every character that has no canonical decomposition: normalization gives NFD. */
const decomposedFont = (codePoint: number) => decompositionOf(codePoint) === undefined;
/** A font with every character but the singleton-decomposable ones: normalization gives NFC. */
const composedFont = (codePoint: number) => decompositionOf(codePoint)?.length !== 1;
const everything = () => true;
const font = (...codePoints: number[]) => {
  const mapped = new Set(codePoints);
  return (codePoint: number) => mapped.has(codePoint);
};

function normalize(
  codePoints: readonly number[],
  maps: (codePoint: number) => boolean,
  order: "canonical" | "font" = "font",
): number[] {
  return normalizeCharacters(codePoints, new Array<number>(codePoints.length).fill(0), maps, order)
    .codePoints;
}

const beh = 0x628;
const alef = 0x627;
const fatha = 0x64e;
const damma = 0x64f;
const kasra = 0x650;
const shadda = 0x651;
const sukun = 0x652;
const maddah = 0x653;
const hamzaAbove = 0x654;
const hamzaBelow = 0x655;
const subscriptAlef = 0x656;
const smallHighSeen = 0x6dc;
const superscriptAlef = 0x670;

describe("the UAX #53 modifier combining marks", () => {
  test("are the 14 of Unicode 16, all of class 220 or 230", () => {
    const found: number[] = [];
    for (let codePoint = 0; codePoint < 0x110000; codePoint++) {
      if (isModifierCombiningMark(codePoint)) found.push(codePoint);
    }
    expect(found).toEqual([
      0x654, 0x655, 0x658, 0x6dc, 0x6e3, 0x6e7, 0x6e8, 0x8ca, 0x8cb, 0x8cd, 0x8ce, 0x8cf, 0x8d3,
      0x8f3,
    ]);
    expect(found.every((codePoint) => [220, 230].includes(combiningClassOf(codePoint)))).toBe(true);
  });
});

describe("Arabic clusters move their leading modifier marks to the start of the mark run", () => {
  test("a class 230 modifier goes before the vowel; canonical order leaves it", () => {
    expect(normalize([beh, fatha, hamzaAbove], decomposedFont)).toEqual([beh, hamzaAbove, fatha]);
    expect(normalize([beh, fatha, hamzaAbove], decomposedFont, "canonical")).toEqual([
      beh,
      fatha,
      hamzaAbove,
    ]);
  });

  test("a class 220 modifier goes before the vowel", () => {
    expect(normalize([beh, kasra, hamzaBelow], decomposedFont)).toEqual([beh, hamzaBelow, kasra]);
  });

  test("the class 220 modifiers come first, then the class 230 ones, then the rest in font order", () => {
    for (const maps of [decomposedFont, everything]) {
      expect(normalize([beh, hamzaAbove, kasra, hamzaBelow], maps)).toEqual([
        beh,
        hamzaBelow,
        hamzaAbove,
        kasra,
      ]);
    }
    expect(normalize([beh, fatha, shadda, hamzaAbove], decomposedFont)).toEqual([
      beh,
      hamzaAbove,
      shadda,
      fatha,
    ]);
  });

  test("only modifiers that lead the marks of their class move", () => {
    expect(normalize([beh, subscriptAlef, hamzaBelow], decomposedFont)).toEqual([
      beh,
      subscriptAlef,
      hamzaBelow,
    ]);
    expect(normalize([beh, fatha, hamzaAbove, smallHighSeen, maddah], decomposedFont)).toEqual([
      beh,
      hamzaAbove,
      smallHighSeen,
      fatha,
      maddah,
    ]);
    // Maddah leads the class 230 marks, so hamza stays on top of it (UAX #53, as HarfBuzz).
    expect(normalize([beh, maddah, hamzaAbove], decomposedFont)).toEqual([beh, maddah, hamzaAbove]);
  });

  test("the move comes before composition, which still never crosses a mark of the same class", () => {
    expect(normalize([alef, hamzaAbove, maddah], everything)).toEqual([0x623, maddah]);
    expect(normalize([alef, maddah, hamzaAbove], everything)).toEqual([0x622, hamzaAbove]);
    expect(normalize([0x622, hamzaAbove], everything)).toEqual([0x622, hamzaAbove]);
    expect(normalize([alef, fatha, hamzaAbove], everything)).toEqual([0x623, fatha]);
    expect(normalize([alef, kasra, hamzaBelow], everything)).toEqual([0x625, kasra]);
    // Without U+0623 the hamza stays and blocks maddah from alef (HarfBuzz would compose U+0622 here).
    const noAlefHamza = font(alef, 0x622, maddah, hamzaAbove, fatha);
    expect(normalize([alef, hamzaAbove, maddah], noAlefHamza)).toEqual([alef, hamzaAbove, maddah]);
    expect(normalize([0x623, maddah], noAlefHamza)).toEqual([alef, hamzaAbove, maddah]);
    expect(normalize([alef, maddah, hamzaAbove], noAlefHamza)).toEqual([0x622, hamzaAbove]);
    expect(normalize([alef, fatha, hamzaAbove], noAlefHamza)).toEqual([alef, hamzaAbove, fatha]);
  });

  test("every canonically equivalent spelling of a cluster gives the same characters", () => {
    const clusters = [
      [beh, fatha, hamzaAbove, hamzaBelow, kasra],
      [alef, fatha, hamzaAbove, shadda],
      [alef, hamzaBelow, kasra, hamzaAbove],
      [alef, maddah, hamzaAbove, damma],
      [beh, smallHighSeen, hamzaAbove, sukun, subscriptAlef],
      [alef, hamzaAbove, maddah, superscriptAlef, hamzaBelow],
    ];
    const all = [alef, beh, fatha, damma, kasra, shadda, sukun, maddah, hamzaAbove, hamzaBelow];
    const fonts = [
      decomposedFont,
      composedFont,
      font(...all, subscriptAlef, smallHighSeen, superscriptAlef, 0x622),
      font(...all, subscriptAlef, smallHighSeen, superscriptAlef, 0x622, 0x623, 0x625),
    ];
    let spellingsChecked = 0;
    for (const [base = 0, ...marks] of clusters) {
      const spellings = equivalentSpellings(base, marks);
      expect(spellings.length).toBeGreaterThan(2);
      for (const maps of fonts) {
        const expected = normalize([base, ...marks], maps);
        for (const spelling of spellings) {
          expect(normalize(spelling, maps), spelling.map((c) => c.toString(16)).join(" ")).toEqual(
            expected,
          );
          spellingsChecked++;
        }
      }
    }
    expect(spellingsChecked).toBeGreaterThan(200);
    expect(normalize(clusters[0] ?? [], decomposedFont)).toEqual([
      beh,
      hamzaBelow,
      hamzaAbove,
      fatha,
      kasra,
    ]);
  });

  test("only clusters of Arabic script move their modifiers", () => {
    expect(normalize([0x61, fatha, hamzaAbove], decomposedFont)).toEqual([0x61, fatha, hamzaAbove]);
    expect(normalize([0x61, 0x301, hamzaAbove], decomposedFont)).toEqual([0x61, 0x301, hamzaAbove]);
    // A dotted circle is Common and the marks Inherited: no Arabic letter, no move.
    expect(normalize([0x25cc, fatha, hamzaAbove], decomposedFont)).toEqual([
      0x25cc,
      fatha,
      hamzaAbove,
    ]);
    expect(normalizeText("بَٔ aَٔ", decomposedFont).codePoints).toEqual([
      beh,
      hamzaAbove,
      fatha,
      0x20,
      0x61,
      fatha,
      hamzaAbove,
    ]);
  });

  test("a run of more than 32 marks stays as written, 32 are sorted and moved", () => {
    const marks = (count: number) =>
      Array.from({ length: count }, (_, index) => (index % 2 === 0 ? fatha : hamzaAbove));
    const long = [beh, ...marks(maxReorderedMarks + 1)];
    expect(normalize(long, decomposedFont)).toEqual(long);
    expect(normalize([beh, ...marks(maxReorderedMarks)], decomposedFont)).toEqual([
      beh,
      ...new Array<number>(16).fill(hamzaAbove),
      ...new Array<number>(16).fill(fatha),
    ]);
  });

  test("NFC (the accessible text) keeps Unicode's order", () => {
    expect(normalizeNfc("آٔ")).toBe("آٔ");
    expect(normalizeNfc("بَٔ")).toBe("بَٔ");
    expect(normalizeNfc("أَ")).toBe("أَ");
  });
});

test("moveModifierMarks takes steps linear in the run and moves keys with their code points", () => {
  const codePoints = [kasra, hamzaBelow, subscriptAlef, hamzaAbove, smallHighSeen, maddah];
  const keys = codePoints.map((codePoint) => codePoint);
  const steps = moveModifierMarks(codePoints, keys, 0, codePoints.length);
  expect(codePoints).toEqual([hamzaBelow, hamzaAbove, smallHighSeen, kasra, subscriptAlef, maddah]);
  expect(keys).toEqual(codePoints);
  expect(steps).toBeLessThanOrEqual(4 * codePoints.length);
});

/**
 * The spellings canonically equivalent to `base` + `marks`: every order of the marks that keeps the order of marks of
 * one class, and with alef the precomposed letter for a leading maddah, hamza above or hamza below.
 */
function equivalentSpellings(base: number, marks: readonly number[]): number[][] {
  const classOrder = (sequence: readonly number[]) =>
    [...new Set(sequence.map(combiningClassOf))]
      .map((combining) => sequence.filter((mark) => combiningClassOf(mark) === combining).join())
      .sort()
      .join("|");
  const reference = classOrder(marks);
  const spellings: number[][] = [];
  for (const order of permutations(marks)) {
    if (classOrder(order) !== reference) continue;
    spellings.push([base, ...order]);
    const precomposed = new Map([
      [maddah, 0x622],
      [hamzaAbove, 0x623],
      [hamzaBelow, 0x625],
    ]).get(order[0] ?? 0);
    if (base === alef && precomposed !== undefined)
      spellings.push([precomposed, ...order.slice(1)]);
  }
  return spellings;
}

function permutations(values: readonly number[]): number[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
      value,
      ...rest,
    ]),
  );
}
