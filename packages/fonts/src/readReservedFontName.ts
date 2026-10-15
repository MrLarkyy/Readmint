import { MalformedFont } from "./MalformedFont.js";
import { readNameStrings } from "./readNameStrings.js";
import type { ReservedFontNameHint } from "./ReservedFontNameHint.js";
import type { SfntReader } from "./SfntReader.js";
import type { SfntTable } from "./readTableDirectory.js";

const phrase = "with reserved font name";
const oflMarkers = ["open font license", "openfontlicense.org", "scripts.sil.org/ofl"];

/**
 * The Reserved Font Name hint of a name table; never throws. The OFL itself (often all of name 13) defines the term
 * "Reserved Font Name" without naming one, and its template says `with Reserved Font Name <Reserved Font Name>`:
 * only the phrase followed by an actual name counts.
 */
export function readReservedFontName(
  reader: SfntReader,
  name: SfntTable | undefined,
): ReservedFontNameHint {
  let strings;
  try {
    strings = readNameStrings(reader, name, [0, 13, 14]);
  } catch (error) {
    if (error instanceof MalformedFont) return "none";
    throw error;
  }
  const folded = strings.map((string) => ({ nameId: string.nameId, text: fold(string.text) }));
  const stated = folded.some(({ nameId, text }) => nameId !== 14 && statesName(text));
  if (!stated) return "none";
  const ofl = folded.some(
    ({ nameId, text }) => nameId !== 0 && oflMarkers.some((marker) => text.includes(marker)),
  );
  return ofl ? "stated-ofl" : "stated";
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

function statesName(text: string): boolean {
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    let next = at + phrase.length;
    if (text[next] === "s") next++;
    while (next < text.length && " \"'“”‘’".includes(text.charAt(next))) next++;
    if (next < text.length && text[next] !== "<") return true;
  }
  return false;
}
