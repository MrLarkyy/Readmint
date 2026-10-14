/**
 * Characters the source must never carry raw into an error excerpt (they reach logs): C0 and C1
 * controls, the twelve Bidi_Control characters (Trojan Source) and the line and paragraph
 * separators. Takes one UTF-16 code unit.
 */
export function isInvisible(unit: number): boolean {
  return (
    unit < 0x20 ||
    (unit >= 0x7f && unit <= 0x9f) ||
    unit === 0x061c ||
    unit === 0x200e ||
    unit === 0x200f ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    (unit >= 0x202a && unit <= 0x202e) ||
    (unit >= 0x2066 && unit <= 0x2069)
  );
}
