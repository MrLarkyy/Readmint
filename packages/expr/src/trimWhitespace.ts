/**
 * The characters `trim` removes, fixed here instead of taken from `String.prototype.trim`, whose set
 * follows the engine's Unicode version: ECMAScript WhiteSpace and LineTerminator, space separators
 * as of Unicode 6.3 and still (tab, line feed, vertical tab, form feed, carriage return, space, U+00A0, U+1680, U+2000 to
 * U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF).
 */
function isTrimmed(unit: number): boolean {
  return (
    (unit >= 0x09 && unit <= 0x0d) ||
    unit === 0x20 ||
    unit === 0xa0 ||
    unit === 0x1680 ||
    (unit >= 0x2000 && unit <= 0x200a) ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    unit === 0x202f ||
    unit === 0x205f ||
    unit === 0x3000 ||
    unit === 0xfeff
  );
}

export function trimWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isTrimmed(text.charCodeAt(start))) start++;
  while (end > start && isTrimmed(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}
