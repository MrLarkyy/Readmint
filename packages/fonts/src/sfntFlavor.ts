import { MalformedFont } from "./MalformedFont.js";

export const TRUETYPE_FLAVOR = 0x00010000;
export const APPLE_TRUETYPE_FLAVOR = 0x74727565;
export const CFF_FLAVOR = 0x4f54544f;
export const COLLECTION_FLAVOR = 0x74746366;

/** The sfnt version a WOFF or WOFF2 wraps; only single TrueType or CFF fonts are read. */
export function checkFlavor(flavor: number, container: string): number {
  if (flavor === TRUETYPE_FLAVOR || flavor === APPLE_TRUETYPE_FLAVOR || flavor === CFF_FLAVOR) {
    return flavor;
  }
  throw new MalformedFont(`${container} wraps no TrueType or CFF font`);
}
