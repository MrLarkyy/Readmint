import { embeddingAllowed, parseSfnt, type SfntFont, type SfntProblemKind } from "@readmint/fonts";
import { EditorLimits } from "./EditorLimits.js";
import type { FontCheck } from "./FontCheck.js";

export type FontFileResult =
  | { readonly ok: true; readonly font: SfntFont; readonly check: FontCheck }
  | { readonly ok: false; readonly kind: SfntProblemKind; readonly message: string };

/**
 * Reads a font file the user gave: its size is checked before anything is parsed or decompressed (against
 * `maxBytes`, at most `maxFontBytes`), then the format is sniffed and the tables read with the same bounds the
 * renderer uses; a WOFF or WOFF2 declaring more than `maxBytes` is refused before it inflates. Never throws for a
 * hostile file.
 */
export function readFontFile(
  bytes: Uint8Array,
  maxBytes: number = EditorLimits.maxFontBytes,
): FontFileResult {
  const max = Math.min(maxBytes, EditorLimits.maxFontBytes);
  if (bytes.length > max) {
    return {
      ok: false,
      kind: "too-large",
      message: `is ${String(bytes.length)} bytes, more than the ${String(max)} a font may have`,
    };
  }
  const parsed = parseSfnt(bytes, { maxBytes: max });
  if (!parsed.ok) {
    return { ok: false, kind: parsed.kind, message: `cannot be used: ${parsed.message}` };
  }
  const fsType = parsed.font.fsType;
  return { ok: true, font: parsed.font, check: { fsType, embeddable: embeddingAllowed(fsType) } };
}
