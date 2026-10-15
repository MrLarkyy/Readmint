import { decodeDataUri } from "./base64.js";
import type { EditorState } from "./EditorState.js";
import type { FontCheck } from "./FontCheck.js";
import { readFontFile } from "./readFontFile.js";

/**
 * Reads the fsType of every font asset whose bytes the editor has (a data URI `src`, or a file attached this
 * session), so the asset panel knows which fonts may never be set to embed. A font that cannot be read gets no
 * check: the preview reports it.
 */
export function checkFonts(state: EditorState): EditorState {
  const fonts = state.design.assets?.fonts ?? {};
  const checks: Record<string, FontCheck> = {};
  for (const [id, asset] of Object.entries(fonts)) {
    const session = state.sessionAssets.fonts;
    const bytes =
      session !== undefined && Object.hasOwn(session, id) ? session[id] : decodeDataUri(asset.src);
    if (bytes === undefined) continue;
    const read = readFontFile(bytes);
    if (read.ok) checks[id] = read.check;
  }
  return { ...state, fontChecks: checks };
}
