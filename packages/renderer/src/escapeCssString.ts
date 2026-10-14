/**
 * The inside of a CSS string (either quote): backslash, quotes, line breaks, `<`, `>`, parentheses and `@` become
 * CSS hex escapes, so the value cannot end the string, the rule or the surrounding `<style>` element, and the
 * style text never holds an `@import` or a `url(` of its own. The caller still XML-escapes the result.
 */
export function escapeCssString(value: string): string {
  return value.replace(/[\\"'<>()@\n\r\f]/gu, (char) => `\\${char.charCodeAt(0).toString(16)} `);
}
