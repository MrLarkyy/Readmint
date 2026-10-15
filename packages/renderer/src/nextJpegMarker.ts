import type { Bytes } from "./Bytes.js";

/**
 * The marker code at or after `start`, the offset just past it and where its run of 0xFF bytes (fill bytes and the
 * marker's own) begins, or undefined when the bytes there are no marker. Strict, a marker must start right at `start`
 * (0xFF fill bytes allowed). Lenient is libjpeg's next_marker: bytes up to a 0xFF are skipped, then fill bytes, and
 * `FF 00` (a stuffed zero, no marker) sends the scan on.
 */
export function nextJpegMarker(
  bytes: Bytes,
  start: number,
  lenient: boolean,
): { readonly marker: number; readonly offset: number; readonly fillStart: number } | undefined {
  let offset = start;
  for (;;) {
    if (bytes.u8(offset) !== 0xff) {
      if (!lenient) return undefined;
      while (bytes.u8(offset) !== 0xff) offset++;
    }
    const fillStart = offset;
    while (bytes.u8(offset) === 0xff) offset++;
    const marker = bytes.u8(offset);
    offset++;
    if (marker !== 0) return { marker, offset, fillStart };
    if (!lenient) return undefined;
  }
}
