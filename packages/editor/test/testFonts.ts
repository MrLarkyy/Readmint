import montserratOtf from "../../renderer/test/fonts/Montserrat-Medium.otf?inline";
import montserratTtf from "../../renderer/test/fonts/Montserrat-Medium.ttf?inline";
import montserratWoff from "../../renderer/test/fonts/Montserrat-Medium.woff?inline";
import montserratWoff2 from "../../renderer/test/fonts/Montserrat-Medium.woff2?inline";
import { withFsType } from "../../renderer/test/fontFixtures.js";

/** The bytes of a base64 data URI; works in Node and in the browser. */
export function dataUriBytes(dataUri: string): Uint8Array {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/**
 * Montserrat Medium (OFL-1.1, fsType 0) from the renderer's test fonts, in every container; no font is committed
 * for the editor. `restricted` is the TTF with its OS/2 fsType set to restricted licence embedding.
 */
export const testFonts = {
  ttf: { name: "Montserrat-Medium.ttf", bytes: dataUriBytes(montserratTtf) },
  otf: { name: "Montserrat-Medium.otf", bytes: dataUriBytes(montserratOtf) },
  woff: { name: "Montserrat-Medium.woff", bytes: dataUriBytes(montserratWoff) },
  woff2: { name: "Montserrat-Medium.woff2", bytes: dataUriBytes(montserratWoff2) },
  restricted: {
    name: "Montserrat-Restricted.ttf",
    bytes: dataUriBytes(withFsType(montserratTtf, 0x0002)),
  },
};

/** What resvg draws the session goldens with. */
export const goldenFonts = ["packages/renderer/test/fonts/Montserrat-Medium.ttf"];
