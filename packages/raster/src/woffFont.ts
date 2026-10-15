import { decodeWoff, FontRefused, MalformedFont } from "@readmint/fonts";
import { RasterError } from "./RasterError.js";

/**
 * The TrueType or OpenType font inside a WOFF 1.0 file, decoded by `@readmint/fonts` (header and directory checked
 * against the file, no table stored larger than it is, all tables together at most `maxBytes` before anything
 * inflates, each table inflating to exactly its declared size). A font it cannot read is a `raster-font` error.
 */
export function woffFont(woff: Uint8Array, maxBytes: number, label: string): Uint8Array {
  try {
    return decodeWoff(woff, maxBytes);
  } catch (error) {
    if (error instanceof MalformedFont || error instanceof FontRefused) {
      throw new RasterError(
        "raster-font",
        `${label} is a WOFF font that cannot be read: ${error.message}`,
      );
    }
    throw error;
  }
}
