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
      statedNames(fold(string.text)).some(
        (stated) =>
          stated === undefined ||
          families.length === 0 ||
          families.some((family) => family.includes(stated)),
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

/**
 * The names each "with reserved font name" phrase of a folded text states; `undefined` for a statement whose names
 * cannot be read (it then counts as used). The OFL template placeholder and a phrase naming nothing state none.
 */
function statedNames(text: string): (string | undefined)[] {
  const names: (string | undefined)[] = [];
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    let next = at + phrase.length;
    if (text[next] === "s") next++;
    while (next < text.length && " \"'“”‘’".includes(text.charAt(next))) next++;
    if (next >= text.length || text[next] === "<") continue;
    const clause = text.slice(next).split(/\. |\.$|;|with reserved font name/, 1)[0] ?? "";
    for (const part of clause.split(/,| and /)) {
      const stated = part.replace(/^[\s"'“”‘’]+|[\s"'“”‘’.]+$/g, "");
      names.push(stated === "" ? undefined : stated);
    }
  }
  return names;
}
