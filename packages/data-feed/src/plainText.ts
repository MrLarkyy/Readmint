// C0 and C1 controls (tab, line feed and carriage return become spaces below) and noncharacters.
// eslint-disable-next-line no-control-regex -- control characters are what is removed here
const REMOVED = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f￾￿]/g;
const ELLIPSIS = "…";

/**
 * One line of display text: control characters removed, every run of whitespace one space, trimmed,
 * and at most `maxLength` code points: a longer text is cut at a code point boundary to
 * `maxLength - 1` and ends in `…`.
 */
export function plainText(text: string, maxLength: number): string {
  const line = text.replace(REMOVED, "").replace(/\s+/g, " ").trim();
  if (line.length <= maxLength) return line;
  let codePoints = 0;
  let end = 0;
  let cut = 0;
  for (const char of line) {
    if (codePoints === maxLength - 1) cut = end;
    codePoints += 1;
    if (codePoints > maxLength) return `${line.slice(0, cut).trimEnd()}${ELLIPSIS}`;
    end += char.length;
  }
  return line;
}
