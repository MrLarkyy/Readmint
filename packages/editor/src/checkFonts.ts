import { decodeDataUri } from "./base64.js";
import { refuse } from "./commitDesign.js";
import { childPointer } from "./designPointer.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";
import type { FontCheck } from "./FontCheck.js";
import { readFontFile } from "./readFontFile.js";

/**
 * Reads the fsType of every font asset whose bytes the editor has (a data URI `src`, or a file attached this
 * session), so the asset panel knows which fonts may never be set to embed. Bounded as in the renderer:
 *
 * - each distinct source is decoded once;
 * - a font may decode to no more than what is left of `maxTotalFontBytes`: the parser refuses a WOFF or WOFF2 whose
 *   declared size is larger before it inflates anything, and a font that reads is charged its decoded size;
 * - the first font that cannot be read (malformed, unsupported, past the allowance) stops the check with an issue at
 *   its pointer, as it stops a render. So at most one font's inflate work is ever spent on a font that fails, and the
 *   fonts that read inflate no more than the allowance in all, however many sources a design names.
 *
 * Fonts after the stop get no check: the panel does not lock them, and the renderer still never embeds a font whose
 * fsType forbids it.
 */
export function checkFonts(state: EditorState): EditorState {
  const fonts = state.design.assets?.fonts ?? {};
  const session = state.sessionAssets.fonts;
  const checks = new Map<string, FontCheck>();
  const read = new Map<string | Uint8Array, FontCheck>();
  let left: number = EditorLimits.maxTotalFontBytes;
  for (const [id, asset] of Object.entries(fonts)) {
    const stop = (reason: string) =>
      refuse(
        { ...state, fontChecks: Object.fromEntries(checks) },
        "font",
        `font asset ${JSON.stringify(id)} ${reason}; fonts from this one on were not checked`,
        childPointer("/assets/fonts", id),
      );
    const supplied = session !== undefined && Object.hasOwn(session, id) ? session[id] : undefined;
    const key = supplied ?? asset.src;
    const known = read.get(key);
    if (known !== undefined) {
      checks.set(id, known);
      continue;
    }
    if (supplied === undefined && !asset.src.startsWith("data:")) continue;
    const bytes = supplied ?? decodeDataUri(asset.src);
    if (bytes === undefined) return stop("cannot be read: its data URI is not valid base64");
    const total = `brings the fonts of this design past ${String(EditorLimits.maxTotalFontBytes)} decoded bytes together (maxTotalFontBytes)`;
    if (bytes.length > left) return stop(total);
    const result = readFontFile(bytes, left);
    if (!result.ok) {
      return stop(
        result.kind === "too-large" && left < EditorLimits.maxFontBytes ? total : result.message,
      );
    }
    if (result.font.sfntBytes > left) return stop(total);
    left -= result.font.sfntBytes;
    read.set(key, result.check);
    checks.set(id, result.check);
  }
  return { ...state, fontChecks: Object.fromEntries(checks) };
}
