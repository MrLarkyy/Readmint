import { decodeWoff } from "./decodeWoff.js";
import { decodeWoff2 } from "./decodeWoff2.js";
import { FontRefused } from "./FontRefused.js";
import { MalformedFont } from "./MalformedFont.js";
import { defaultMaxFontBytes, type ParseSfntOptions } from "./ParseSfntOptions.js";
import { readFont } from "./readFont.js";
import type { SfntProblemKind, SfntResult } from "./SfntFont.js";
import { SfntReader } from "./SfntReader.js";
import { sniffFontFormat } from "./sniffFontFormat.js";

/**
 * Reads a TrueType or OpenType font, bare or in WOFF / WOFF2. The containers are checked against `maxBytes` before
 * anything is decompressed; the tables needed to measure text (head, hhea, maxp, hmtx, OS/2, name, cmap 4/12) are
 * read now, outlines and kerning on first use. Every offset and count is checked against the bytes, so a crafted
 * file gives a problem (or, later, `MalformedFont`), never another throw or a long loop. Collections and CFF2 are
 * unsupported.
 */
export function parseSfnt(bytes: Uint8Array, options: ParseSfntOptions = {}): SfntResult {
  const container = sniffFontFormat(bytes);
  if (container === "ttc")
    return problem("unsupported", "font collections (TTC) are not supported");
  if (container === undefined) return problem("malformed", "not a TrueType or OpenType font");
  const maxBytes = options.maxBytes ?? defaultMaxFontBytes;
  try {
    const sfnt =
      container === "woff"
        ? decodeWoff(bytes, maxBytes)
        : container === "woff2"
          ? decodeWoff2(bytes, maxBytes)
          : bytes;
    const flavor = sniffFontFormat(sfnt);
    if (flavor !== "ttf" && flavor !== "otf") {
      return problem("malformed", "the container holds no TrueType or OpenType font");
    }
    return { ok: true, font: readFont(new SfntReader(sfnt), flavor, container) };
  } catch (error) {
    if (error instanceof MalformedFont) return problem("malformed", error.message);
    if (error instanceof FontRefused) return problem(error.kind, error.message);
    throw error;
  }
}

function problem(kind: SfntProblemKind, message: string): SfntResult {
  return { ok: false, kind, message };
}
