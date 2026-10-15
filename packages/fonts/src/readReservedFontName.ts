import { MalformedFont } from "./MalformedFont.js";
import { readNameStrings } from "./readNameStrings.js";
import type { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

const phrase = "with reserved font name";

/**
 * Whether the copyright (name 0) or licence description (name 13) of a name table states a Reserved Font Name ("with
 * Reserved Font Name" followed by a name) that the font's own family name (name 1 or 16) uses. A renamed fork keeps
 * the upstream copyright line but not the name, so its subset may keep its own name. Never throws. The OFL itself
 * (often all of name 13) defines the term "Reserved Font Name" without naming one, and its template says `with
 * Reserved Font Name <Reserved Font Name>`: only the phrase followed by an actual name counts. A statement whose
 * names cannot be told apart, or a font without a family name, counts as used.
 */
export function readReservedFontName(reader: SfntReader, name: SfntTable | undefined): boolean {
  let strings;
  try {
    strings = readNameStrings(reader, name, [0, 13, 1, 16]);
  } catch (error) {
    if (error instanceof MalformedFont) return false;
    throw error;
  }
  const families = strings
    .filter((string) => string.nameId === 1 || string.nameId === 16)
    .map((string) => fold(string.text));
  return strings.some(
    (string) =>
      (string.nameId === 0 || string.nameId === 13) &&
      statements(fold(string.text)).some(
        (statement) =>
          families.length === 0 ||
          statement.names.some(
            (stated) => stated === undefined || families.some((family) => family.includes(stated)),
          ) ||
          families.some((family) => mentions(statement.loose, family)),
      ),
  );
}

/** ASCII lower case with every whitespace run as one space: the same on every engine and locale. */
function fold(text: string): string {
  let folded = "";
  let space = false;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0xa0) {
      space = true;
      continue;
    }
    if (space && folded !== "") folded += " ";
    space = false;
    folded += String.fromCharCode(code >= 0x41 && code <= 0x5a ? code + 0x20 : code);
  }
  return folded;
}

const quotes = "\"'“”‘’";

interface Statement {
  /** The names told apart; `undefined` for one that cannot be read. */
  readonly names: readonly (string | undefined)[];
  /** The unquoted text up to the sentence end, to match a family name inside it; empty after a quoted name. */
  readonly loose: string;
}

/**
 * The statement each "with reserved font name" phrase makes; a phrase naming nothing or the OFL template placeholder
 * makes none. A name that starts with a quote is the quoted span(s) only; unquoted text is split at "," and "and",
 * and as a whole it also counts when it mentions the family, so trailing words never hide a used name.
 */
function statements(text: string): Statement[] {
  const found: Statement[] = [];
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    let next = at + phrase.length;
    if (text[next] === "s") next++;
    let open = -1;
    while (
      next < text.length &&
      (text[next] === ":" || " ".concat(quotes).includes(text.charAt(next)))
    ) {
      if (open === -1 && quotes.includes(text.charAt(next))) open = next;
      next++;
    }
    if (next >= text.length || text[next] === "<") continue;
    const clause = text.slice(next).split(/\. |\.$|;|with reserved font name/, 1)[0] ?? "";
    if (open !== -1) {
      found.push({ names: quotedNames(text.slice(open, next + clause.length)), loose: "" });
      continue;
    }
    const names = clause.split(/,| and /).map((part) => {
      const stated = part.replace(/^[\s"'“”‘’]+|[\s"'“”‘’.]+$/g, "");
      return stated === "" ? undefined : stated;
    });
    found.push({ names, loose: clause });
  }
  return found;
}

/** The spans between quotes, several joined by "," or "and"; an unclosed or empty span cannot be read. */
function quotedNames(text: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  let rest = text;
  while (quotes.includes(rest.charAt(0)) && rest !== "") {
    let close = 1;
    while (close < rest.length && !quotes.includes(rest.charAt(close))) close++;
    if (close >= rest.length) {
      names.push(undefined);
      break;
    }
    const stated = rest.slice(1, close).trim();
    names.push(stated === "" ? undefined : stated);
    rest = rest.slice(close + 1).replace(/^(?:\s*,\s*|\s+and\s+|\s*,\s*and\s+)/, "");
    if (rest.length === text.length) break;
  }
  return names;
}

/** Whether `family` occurs in `text` as whole words. */
function mentions(text: string, family: string): boolean {
  if (family === "") return false;
  const word = /[\p{L}\p{N}]/u;
  for (let at = text.indexOf(family); at !== -1; at = text.indexOf(family, at + 1)) {
    const before = text.charAt(at - 1);
    const after = text.charAt(at + family.length);
    if (!(at > 0 && word.test(before)) && !(after !== "" && word.test(after))) return true;
  }
  return false;
}
