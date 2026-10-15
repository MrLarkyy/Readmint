/**
 * The modifier combining marks of UAX #53 (Unicode 16.0.0; HarfBuzz's `modifier_combining_marks`): Arabic marks that
 * modify the letter before them and stack nearest to it, before the vowel marks. Kept by hand: Unicode 16 lists them
 * in UAX #53 itself, not in a UCD file the table generator reads.
 */
const modifierCombiningMarks = new Set([
  0x0654, // hamza above
  0x0655, // hamza below
  0x0658, // mark noon ghunna
  0x06dc, // small high seen
  0x06e3, // small low seen
  0x06e7, // small high yeh
  0x06e8, // small high noon
  0x08ca, // small high farsi yeh
  0x08cb, // small high yeh barree with two dots below
  0x08cd, // small high zah
  0x08ce, // large round dot above
  0x08cf, // large round dot below
  0x08d3, // small low waw
  0x08f3, // small high waw
]);

/** Whether a code point is a UAX #53 modifier combining mark. */
export function isModifierCombiningMark(codePoint: number): boolean {
  return modifierCombiningMarks.has(codePoint);
}
