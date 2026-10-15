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
  /** The text outside quotes up to the sentence end, to match a family name's words in it. */
  readonly loose: string;
}

/**
 * The statement each "with reserved font name" phrase makes; a phrase naming nothing or the OFL template placeholder
 * makes none. After a quote every quoted span is a name; unquoted text is split at "," and "and". The text outside
 * quotes also counts when it shares a word with the family, so trailing words or separators never hide a used name.
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
      found.push(quoted(text.slice(open, next + clause.length)));
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

/**
 * Every span between quotes is a name, whatever separates the spans; the text outside them is the loose rest. An
 * unclosed or empty span cannot be read.
 */
function quoted(clause: string): Statement {
  const names: (string | undefined)[] = [];
  let loose = "";
  let at = 0;
  while (at < clause.length) {
    if (!quotes.includes(clause.charAt(at))) {
      loose += clause.charAt(at++);
      continue;
    }
    let close = at + 1;
    while (close < clause.length && !quotes.includes(clause.charAt(close))) close++;
    if (close >= clause.length) {
      names.push(undefined);
      break;
    }
    const stated = clause.slice(at + 1, close).trim();
    names.push(stated === "" ? undefined : stated);
    loose += " ";
    at = close + 1;
  }
  return { names, loose };
}

/**
 * Whether `text` and `family` share a whole word, so an unquoted name with trailing words, or one only part of a wider
 * family name, still counts; a family without words counts when `text` contains it.
 */
function mentions(text: string, family: string): boolean {
  const own = words(family);
  if (own.length === 0) return family !== "" && text.includes(family);
  const stated = new Set(words(text));
  return own.some((word) => stated.has(word));
}

/**
 * The runs of ASCII letters and digits or characters from U+0080 up: decided by code unit alone, so no engine's
 * Unicode data takes part.
 */
function words(text: string): string[] {
  const found: string[] = [];
  let start = -1;
  for (let index = 0; index <= text.length; index++) {
    const code = index < text.length ? text.charCodeAt(index) : 0;
    const word =
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      code >= 0x80;
    if (word && start === -1) start = index;
    if (!word && start !== -1) {
      found.push(text.slice(start, index));
      start = -1;
    }
  }
  return found;
}
