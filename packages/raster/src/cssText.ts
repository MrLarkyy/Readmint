/** The inside of a CSS string with its escapes resolved (`\28 ` hex escapes and `\x` for a character). */
export function unescapeCss(text: string): string {
  return text.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|([^\n0-9a-fA-F]))/g,
    (_whole, hex: string | undefined, char: string | undefined) => {
      if (char !== undefined) return char;
      const code = parseInt(hex ?? "", 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "�";
    },
  );
}

/** The families of a CSS `font-family` value, in order, quotes and escapes resolved. */
export function fontFamilies(value: string): string[] {
  const families: string[] = [];
  for (const [, double, single, bare] of value.matchAll(
    /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+?))\s*(?:,|$)/g,
  )) {
    const family = double ?? single ?? bare?.replace(/\s+/g, " ");
    if (family !== undefined && family !== "") families.push(unescapeCss(family));
  }
  return families;
}

/** A family name as a single-quoted CSS string, every character that could end it escaped. */
export function quoteCssFamily(family: string): string {
  const escaped = family.replace(
    /[\\"'\n\r\f]/g,
    (char) => `\\${char.charCodeAt(0).toString(16)} `,
  );
  return `'${escaped}'`;
}
