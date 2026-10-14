/**
 * A bare CSS value outside any string (a font weight, a font style): every character but letters, digits, `.`, `_`
 * and `-` becomes a CSS hex escape, so the value cannot end its declaration or rule, or start an at-rule or a `url(`.
 * Valid values (`400`, `italic`) pass unchanged. The caller still XML-escapes the result.
 */
export function escapeCssToken(value: string): string {
  return value.replace(/[^\w.-]/gu, (char) => `\\${(char.codePointAt(0) ?? 0).toString(16)} `);
}
