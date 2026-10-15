import { decodeDataUri } from "./base64.js";
import { refuse } from "./commitDesign.js";
import { childPointer } from "./designPointer.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";
import type { FontCheck } from "./FontCheck.js";
import { readFontFile } from "./readFontFile.js";

/**
 * Reads the fsType of every font asset whose bytes the editor has (a data URI `src`, or a file attached this
 * session), so the asset panel knows which fonts may never be set to embed. As in the renderer, each distinct source
 * is decoded once, and the fonts together may decode to at most `maxTotalFontBytes`, charged by declared size before
 * anything inflates: the first font past it stops the check with an issue, so a design of many small font bombs
 * costs a bounded amount of work on the main thread. A font that cannot be read gets no check: the preview reports
 * it, and the renderer still never embeds a font its fsType forbids.
 */
export function checkFonts(state: EditorState): EditorState {
  const fonts = state.design.assets?.fonts ?? {};
  const session = state.sessionAssets.fonts;
  const checks = new Map<string, FontCheck>();
  const read = new Map<string | Uint8Array, FontCheck | undefined>();
  let left: number = EditorLimits.maxTotalFontBytes;
  for (const [id, asset] of Object.entries(fonts)) {
    const supplied = session !== undefined && Object.hasOwn(session, id) ? session[id] : undefined;
    const key = supplied ?? asset.src;
    if (!read.has(key)) {
      const bytes = supplied ?? decodeDataUri(asset.src);
      if (bytes === undefined) continue;
      const total = () =>
        refuse(
          { ...state, fontChecks: Object.fromEntries(checks) },
          "font",
          `the fonts of this design decode to more than ${String(EditorLimits.maxTotalFontBytes)} bytes together (maxTotalFontBytes); fonts from this one on were not checked`,
          childPointer("/assets/fonts", id),
        );
      if (bytes.length > left) return total();
      const result = readFontFile(bytes, left);
      if (!result.ok && result.kind === "too-large" && left < EditorLimits.maxFontBytes) {
        return total();
      }
      if (result.ok && result.font.sfntBytes > left) return total();
      if (result.ok) left -= result.font.sfntBytes;
      read.set(key, result.ok ? result.check : undefined);
    }
    const check = read.get(key);
    if (check !== undefined) checks.set(id, check);
  }
  return { ...state, fontChecks: Object.fromEntries(checks) };
}
