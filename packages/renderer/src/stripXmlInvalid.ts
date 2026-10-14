const invalid = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/**
 * `text` without the code points XML 1.0 does not allow anywhere in a document (not even as a character reference):
 * the C0 controls except tab, line feed and carriage return, lone surrogates, and U+FFFE / U+FFFF. A surrogate pair
 * is one code point and stays. GitHub free texts (a bio, a description) may carry any of them.
 */
export function stripXmlInvalid(text: string): string {
  return text.replace(invalid, "");
}
