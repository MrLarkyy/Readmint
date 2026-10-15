import {
  isDefaultIgnorable,
  isLetter,
  isNonSpacingMark,
  isSpacingMark,
} from "./unicode/characterFlags.js";
import { indicSyllabicOf } from "./unicode/indicCategory.js";

const zwj = 0x200d;
const devanagariVirama = 0x094d;

const isRegionalIndicator = (codePoint: number) => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
const isEmojiModifier = (codePoint: number) => codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
const isDevanagariConsonant = (codePoint: number) => {
  const category = indicSyllabicOf(codePoint);
  return codePoint >= 0x0900 && codePoint <= 0x097f && category.startsWith("Consonant");
};

/**
 * UTF-16 offsets where a cluster of characters that must stay together starts: a base with its marks, joiners,
 * variation selectors and other default ignorables (which are never drawn on their own), a symbol after ZWJ (emoji
 * sequences: UAX #29 GB11 without Extended_Pictographic data, so any non-letter), a
 * Devanagari conjunct (consonant, virama, consonant: UAX #29 GB9c), a pair of regional indicators. Close to UAX #29
 * grapheme clusters, from this package's Unicode tables only, so every engine splits the same way.
 */
export function clusterStarts(text: string): number[] {
  const starts: number[] = [];
  let previous = -1;
  let linker = false;
  let consonantBase = false;
  let regionalIndicators = 0;
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index) ?? 0;
    const extend =
      isNonSpacingMark(codePoint) ||
      isSpacingMark(codePoint) ||
      isDefaultIgnorable(codePoint) ||
      isEmojiModifier(codePoint);
    const joins =
      previous >= 0 &&
      (extend ||
        (previous === zwj && !isLetter(codePoint)) ||
        (linker && isDevanagariConsonant(codePoint)) ||
        (isRegionalIndicator(codePoint) && regionalIndicators % 2 === 1));
    if (!joins) {
      starts.push(index);
      linker = false;
      consonantBase = isDevanagariConsonant(codePoint);
      regionalIndicators = 0;
    } else if (isDevanagariConsonant(codePoint)) {
      linker = false;
      consonantBase = true;
    }
    if (codePoint === devanagariVirama && consonantBase) linker = true;
    if (isRegionalIndicator(codePoint)) regionalIndicators++;
    previous = codePoint;
    if (codePoint > 0xffff) index++;
  }
  return starts;
}
