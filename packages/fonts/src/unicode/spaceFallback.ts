/** How HarfBuzz sizes a space character a font does not map (`space_fallback_type`). */
export type SpaceFallback =
  | { readonly kind: "em"; readonly divisor: number }
  | { readonly kind: "em4of18" }
  | { readonly kind: "figure" }
  | { readonly kind: "punctuation" }
  | { readonly kind: "narrow" }
  | { readonly kind: "space" };

const em = (divisor: number): SpaceFallback => ({ kind: "em", divisor });
const table = new Map<number, SpaceFallback>([
  [0x00a0, { kind: "space" }],
  [0x2000, em(2)],
  [0x2001, em(1)],
  [0x2002, em(2)],
  [0x2003, em(1)],
  [0x2004, em(3)],
  [0x2005, em(4)],
  [0x2006, em(6)],
  [0x2007, { kind: "figure" }],
  [0x2008, { kind: "punctuation" }],
  [0x2009, em(5)],
  [0x200a, em(16)],
  [0x202f, { kind: "narrow" }],
  [0x205f, { kind: "em4of18" }],
  [0x3000, em(1)],
]);

/** The fallback of a space variant, undefined for other characters (U+1680 is left out, as HarfBuzz does). */
export function spaceFallbackOf(codePoint: number): SpaceFallback | undefined {
  return table.get(codePoint);
}
