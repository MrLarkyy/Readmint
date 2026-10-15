import { embeddingAllowed, parseSfnt, type SfntFont } from "@readmint/fonts";
import { EditorLimits } from "./EditorLimits.js";
import type { FontCheck } from "./FontCheck.js";

export type FontFileResult =
  | { readonly ok: true; readonly font: SfntFont; readonly check: FontCheck }
  | { readonly ok: false; readonly message: string };

/**
 * Reads a font file the user gave: its size is checked before anything is parsed or decompressed, then the format
 * is sniffed and the tables read with the same bounds the renderer uses. Never throws for a hostile file.
 */
export function readFontFile(bytes: Uint8Array): FontFileResult {
  if (bytes.length > EditorLimits.maxFontBytes) {
    return {
      ok: false,
      message: `is ${String(bytes.length)} bytes, more than the ${String(EditorLimits.maxFontBytes)} a font may have`,
    };
  }
  const parsed = parseSfnt(bytes, { maxBytes: EditorLimits.maxFontBytes });
  if (!parsed.ok) return { ok: false, message: `cannot be used: ${parsed.message}` };
  const fsType = parsed.font.fsType;
  return { ok: true, font: parsed.font, check: { fsType, embeddable: embeddingAllowed(fsType) } };
}
