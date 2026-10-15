import type { Bytes } from "./Bytes.js";

/**
 * The marker code at or after `start` and the offset just past it, or undefined when the bytes there are no marker.
 * Strict, a marker must start right at `start` (0xFF fill bytes allowed). Lenient is libjpeg's next_marker: bytes
 * up to a 0xFF are skipped, then fill bytes, and `FF 00` (a stuffed zero, no marker) sends the scan on.
 */
export function nextJpegMarker(
  bytes: Bytes,
  start: number,
  lenient: boolean,
): { readonly marker: number; readonly offset: number } | undefined {
  let offset = start;
  for (;;) {
    if (bytes.u8(offset) !== 0xff) {
      if (!lenient) return undefined;
      while (bytes.u8(offset) !== 0xff) offset++;
    }
    while (bytes.u8(offset) === 0xff) offset++;
    const marker = bytes.u8(offset);
    offset++;
    if (marker !== 0) return { marker, offset };
    if (!lenient) return undefined;
  }
}
