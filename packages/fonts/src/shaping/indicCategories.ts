import { indicPositionalOf, indicSyllabicOf } from "../unicode/indicCategory.js";

/** HarfBuzz's Indic shaping categories. */
export const Category = {
  X: 0,
  C: 1,
  V: 2,
  N: 3,
  H: 4,
  ZWNJ: 5,
  ZWJ: 6,
  M: 7,
  SM: 8,
  A: 10,
  PLACEHOLDER: 11,
  DOTTEDCIRCLE: 12,
  RS: 13,
  Repha: 15,
  Ra: 16,
  CM: 17,
  Symbol: 18,
  CS: 19,
} as const;

/** HarfBuzz's Indic positions, in the order initial reordering sorts by. */
export const Position = {
  start: 0,
  raToBecomeReph: 1,
  preM: 2,
  preC: 3,
  baseC: 4,
  afterMain: 5,
  aboveC: 6,
  beforeSub: 7,
  belowC: 8,
  afterSub: 9,
  beforePost: 10,
  postC: 11,
  afterPost: 12,
  smvd: 13,
  end: 14,
} as const;

export const dottedCircle = 0x25cc;

/** Categories that can be a syllable's base. */
export const consonants = new Set<number>([
  Category.C,
  Category.CS,
  Category.Ra,
  Category.CM,
  Category.V,
  Category.PLACEHOLDER,
  Category.DOTTEDCIRCLE,
]);

const syllabicCategories: Readonly<Record<string, number>> = {
  Bindu: Category.SM,
  Visarga: Category.SM,
  Syllable_Modifier: Category.SM,
  Avagraha: Category.Symbol,
  Nukta: Category.N,
  Virama: Category.H,
  Pure_Killer: Category.H,
  Invisible_Stacker: Category.H,
  Reordering_Killer: Category.H,
  Vowel_Independent: Category.V,
  Vowel: Category.V,
  Vowel_Dependent: Category.M,
  Consonant_Placeholder: Category.PLACEHOLDER,
  Number: Category.PLACEHOLDER,
  Brahmi_Joining_Number: Category.PLACEHOLDER,
  Consonant: Category.C,
  Consonant_Dead: Category.C,
  Consonant_Head_Letter: Category.C,
  Consonant_Initial_Postfixed: Category.C,
  Consonant_Final: Category.C,
  Consonant_Prefixed: Category.C,
  Consonant_Subjoined: Category.C,
  Consonant_Succeeding_Repha: Category.C,
  Consonant_With_Stacker: Category.CS,
  Consonant_Preceding_Repha: Category.Repha,
  Consonant_Medial: Category.CM,
  Tone_Mark: Category.A,
  Cantillation_Mark: Category.A,
  Joiner: Category.ZWJ,
  Non_Joiner: Category.ZWNJ,
  Register_Shifter: Category.RS,
};

/** The Devanagari Ra, which forms reph. */
const ra = 0x0930;

/** The Indic category and initial position of a character (HarfBuzz set_indic_properties, Devanagari rules). */
export function indicProperties(codePoint: number): { category: number; position: number } {
  let category = syllabicCategories[indicSyllabicOf(codePoint)] ?? Category.X;
  if (codePoint === dottedCircle) category = Category.DOTTEDCIRCLE;
  if (codePoint === ra) category = Category.Ra;
  if (consonants.has(category)) return { category, position: Position.baseC };
  if (category === Category.M) {
    // Devanagari: a left matra is reordered before the base, every other one sits after the subjoined forms.
    const left = indicPositionalOf(codePoint) === "Left";
    return { category, position: left ? Position.preM : Position.afterSub };
  }
  if (category === Category.SM || category === Category.A) {
    return { category, position: Position.smvd };
  }
  return { category, position: Position.end };
}
