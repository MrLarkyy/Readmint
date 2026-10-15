import { crc32 } from "./crc32.js";
import type { ImageInfo } from "./sniffImage.js";

/**
 * The image bytes with every EXIF Orientation entry rewritten to SHORT 1 (upright), so no decoder turns the pixels
 * and the renderer's transform alone orients them, the same in resvg and browsers. Entries keep their length, so no
 * offset in the file moves; a PNG `eXIf` chunk gets its CRC recomputed, or decoders would drop or refuse it. The
 * given bytes are never changed: without an Orientation entry they are returned as they are, otherwise a copy.
 */
export function uprightImage(data: Uint8Array, info: ImageInfo): Uint8Array {
  if (info.orientationFields.length === 0) return data;
  const upright = data.slice();
  const view = new DataView(upright.buffer, upright.byteOffset, upright.byteLength);
  for (const field of info.orientationFields) {
    for (const entry of field.entries) {
      view.setUint16(entry + 2, 3, field.littleEndian);
      view.setUint32(entry + 4, 1, field.littleEndian);
      // A SHORT sits in the first two bytes of the four-byte value field.
      view.setUint32(entry + 8, 0);
      view.setUint16(entry + 8, 1, field.littleEndian);
    }
    const checksum = field.checksum;
    if (checksum !== undefined) {
      view.setUint32(checksum.end, crc32(upright.subarray(checksum.start, checksum.end)));
    }
  }
  return upright;
}
