import { Unzlib } from "fflate";
import { MalformedFont } from "./MalformedFont.js";

/** Input fed to the inflater per step: one step writes at most ~1032 times this, so a bomb is stopped early. */
const chunk = 4096;

/**
 * zlib data inflated into exactly `size` bytes. The data is fed in small steps and inflation stops as soon as the
 * output passes `size`, so a decompression bomb costs at most `size` plus one step of work and memory.
 */
export function inflateExact(data: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let written = 0;
  const inflater = new Unzlib((piece) => {
    if (written + piece.length > size) {
      throw new MalformedFont("font table inflates to more bytes than it declares");
    }
    out.set(piece, written);
    written += piece.length;
  });
  try {
    for (let offset = 0; offset < data.length; offset += chunk) {
      const end = Math.min(offset + chunk, data.length);
      inflater.push(data.subarray(offset, end), end === data.length);
    }
  } catch (error) {
    if (error instanceof MalformedFont) throw error;
    throw new MalformedFont("font table is not valid zlib data");
  }
  if (written !== size)
    throw new MalformedFont("font table inflates to fewer bytes than it declares");
  return out;
}
