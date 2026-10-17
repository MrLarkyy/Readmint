import { BLOCK_ELEMENTS, HIDDEN_ELEMENTS } from "./htmlElements.js";

// A Map, not an object: a name such as `constructor` must not find a prototype member.
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["hellip", "…"],
  ["mdash", "—"],
  ["ndash", "–"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ldquo", "“"],
  ["rdquo", "”"],
  ["laquo", "«"],
  ["raquo", "»"],
  ["middot", "·"],
  ["bull", "•"],
  ["copy", "©"],
  ["reg", "®"],
  ["trade", "™"],
  ["euro", "€"],
]);
const MAX_REFERENCE_LENGTH = 10;
const TAG_NAME = /^<\/?([A-Za-z][A-Za-z0-9-]{0,31})/;

/**
 * The text of an HTML fragment, in one forward scan: tags and comments dropped, script, style and
 * template content dropped, a space at each block element, character references and a fixed set
 * of named entities decoded (an unknown one stays as written). Not an HTML parser: the result is
 * only ever text, which the renderer escapes, so a malformed fragment can lose words, never
 * become markup.
 */
export function htmlToText(html: string): string {
  const parts: string[] = [];
  let index = 0;
  while (index < html.length) {
    const char = html[index];
    if (char === "<") {
      index = skipMarkup(html, index, parts);
    } else if (char === "&") {
      index = readReference(html, index, parts);
    } else {
      let end = index + 1;
      while (end < html.length && html[end] !== "<" && html[end] !== "&") end += 1;
      parts.push(html.slice(index, end));
      index = end;
    }
  }
  return parts.join("");
}

/** Skips a tag, comment or hidden element at `<`, pushing a space for a block; returns the next index. */
function skipMarkup(html: string, start: number, parts: string[]): number {
  if (html.startsWith("<!--", start)) {
    const end = html.indexOf("-->", start + 4);
    return end === -1 ? html.length : end + 3;
  }
  const next = html[start + 1] ?? "";
  if (!/[A-Za-z/!?]/.test(next)) {
    parts.push("<");
    return start + 1;
  }
  const end = tagEnd(html, start + 1);
  const name = TAG_NAME.exec(html.slice(start, start + 34))?.[1]?.toLowerCase();
  if (name === undefined) return end;
  if (BLOCK_ELEMENTS.has(name)) parts.push(" ");
  if (next !== "/" && HIDDEN_ELEMENTS.has(name) && html[end - 2] !== "/") {
    const close = new RegExp(`</${name}\\s*>`, "gi");
    close.lastIndex = end;
    return close.exec(html) === null ? html.length : close.lastIndex;
  }
  return end;
}

/** Index after the `>` closing a tag, skipping quoted attribute values; the end when unclosed. */
function tagEnd(html: string, from: number): number {
  let quote: string | null = null;
  for (let index = from; index < html.length; index += 1) {
    const char = html[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return index + 1;
    }
  }
  return html.length;
}

function readReference(html: string, start: number, parts: string[]): number {
  let end = start + 1;
  while (end < html.length && end - start <= MAX_REFERENCE_LENGTH && html[end] !== ";") end += 1;
  const decoded = html[end] === ";" ? decodeReference(html.slice(start + 1, end)) : undefined;
  if (decoded === undefined) {
    parts.push("&");
    return start + 1;
  }
  parts.push(decoded);
  return end + 1;
}

function decodeReference(body: string): string | undefined {
  if (!body.startsWith("#")) return NAMED_ENTITIES.get(body);
  const digits = /^#(?:([0-9]{1,7})|[xX]([0-9A-Fa-f]{1,6}))$/.exec(body);
  if (digits === null) return undefined;
  const code =
    digits[1] !== undefined ? Number.parseInt(digits[1], 10) : Number.parseInt(digits[2] ?? "", 16);
  const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
  return valid ? String.fromCodePoint(code) : undefined;
}
