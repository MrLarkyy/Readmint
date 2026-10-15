import { isDefaultIgnorable, isNonSpacingMark, isSpacingMark } from "./unicode/characterFlags.js";
import { isStrong } from "./unicode/bidiClass.js";
import { composesWithStarterBefore } from "./unicode/canonicalDecomposition.js";
import { combiningClassOf } from "./unicode/combiningClass.js";
import { indicSyllabicOf } from "./unicode/indicCategory.js";

const zwj = 0x200d;
const devanagariVirama = 0x094d;
/** Code points one cluster may hold. */
export const maxClusterLength = 32;

const isRegionalIndicator = (codePoint: number) => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
const isEmojiModifier = (codePoint: number) => codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
const isDevanagariConsonant = (codePoint: number) => {
  const category = indicSyllabicOf(codePoint);
  return codePoint >= 0x0900 && codePoint <= 0x097f && category.startsWith("Consonant");
};

/** Hangul_Syllable_Type (UAX #29), from the fixed jamo and syllable ranges. */
const Jamo = { none: 0, leading: 1, vowel: 2, trailing: 3, lv: 4, lvt: 5 } as const;
type Jamo = (typeof Jamo)[keyof typeof Jamo];

function jamoOf(codePoint: number): Jamo {
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97c)
  ) {
    return Jamo.leading;
  }
  if (
    (codePoint >= 0x1160 && codePoint <= 0x11a7) ||
    (codePoint >= 0xd7b0 && codePoint <= 0xd7c6)
  ) {
    return Jamo.vowel;
  }
  if (
    (codePoint >= 0x11a8 && codePoint <= 0x11ff) ||
    (codePoint >= 0xd7cb && codePoint <= 0xd7fb)
  ) {
    return Jamo.trailing;
  }
  if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
    return (codePoint - 0xac00) % 28 === 0 ? Jamo.lv : Jamo.lvt;
  }
  return Jamo.none;
}

/** UAX #29 GB6-GB8: conjoining jamo that spell one syllable stay together. */
function joinsSyllable(previous: Jamo, next: Jamo): boolean {
  switch (previous) {
    case Jamo.leading:
      return next === Jamo.leading || next === Jamo.vowel || next === Jamo.lv || next === Jamo.lvt;
    case Jamo.lv:
    case Jamo.vowel:
      return next === Jamo.vowel || next === Jamo.trailing;
    case Jamo.lvt:
    case Jamo.trailing:
      return next === Jamo.trailing;
    default:
      return false;
  }
}

/**
 * UTF-16 offsets where a cluster of characters that must stay together starts: a base with its marks, joiners,
 * variation selectors and other default ignorables (which are never drawn on their own), a symbol after ZWJ (emoji
 * sequences: UAX #29 GB11 without Extended_Pictographic data, so any character that is not strong (a letter)), a
 * Devanagari conjunct (consonant, virama, consonant: UAX #29 GB9c), the conjoining jamo of a Hangul syllable (GB6-GB8,
 * so a decomposed syllable recomposes before shaping), a character whose decomposition starts with a letter that
 * composes canonically with a starter before it (Kirat Rai vowel signs: UAX #15 composes such starters only when
 * adjacent, so normalizing per cluster is NFC), a pair of regional indicators. Close to UAX #29
 * grapheme clusters, from this package's Unicode tables only, so every engine splits the same way. A cluster holds at
 * most 32 code points (like the stream-safe text format's 30 non-starters): a longer run of marks or conjuncts goes
 * on in a new cluster, so the work per cluster stays bounded.
 */
export function clusterStarts(text: string): number[] {
  const starts: number[] = [];
  let previous = -1;
  let linker = false;
  let consonantBase = false;
  let regionalIndicators = 0;
  let length = 0;
  for (let index = 0; index < text.length; index++) {
    const codePoint = text.codePointAt(index) ?? 0;
    const extend =
      isNonSpacingMark(codePoint) ||
      isSpacingMark(codePoint) ||
      isDefaultIgnorable(codePoint) ||
      isEmojiModifier(codePoint);
    const joins =
      previous >= 0 &&
      length < maxClusterLength &&
      (extend ||
        (previous === zwj && !isStrong(codePoint)) ||
        (linker && isDevanagariConsonant(codePoint)) ||
        joinsSyllable(jamoOf(previous), jamoOf(codePoint)) ||
        (combiningClassOf(previous) === 0 && composesWithStarterBefore(codePoint)) ||
        (isRegionalIndicator(codePoint) && regionalIndicators % 2 === 1));
    if (!joins) {
      starts.push(index);
      linker = false;
      consonantBase = isDevanagariConsonant(codePoint);
      regionalIndicators = 0;
      length = 0;
    } else if (isDevanagariConsonant(codePoint)) {
      linker = false;
      consonantBase = true;
    }
    if (codePoint === devanagariVirama && consonantBase) linker = true;
    if (isRegionalIndicator(codePoint)) regionalIndicators++;
    previous = codePoint;
    length++;
    if (codePoint > 0xffff) index++;
  }
  return starts;
}
