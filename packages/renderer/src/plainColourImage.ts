import type { ImageInfo } from "./sniffImage.js";

/** The VP8X flag saying an ICCP chunk is present. */
const webpIccFlag = 0x20;

/**
 * The image bytes without the colour-management data `info.colourData` locates, and a WebP without its ICC flag, so
 * Chromium draws the stored pixel values as sRGB, as resvg always does: the preview and the output agree for every
 * profile, sRGB or not, and no profile is ever parsed. The pixels are not converted. The ranges are ascending and
 * disjoint (one walk records them), so the copy is a single pass; the given bytes are never changed, and returned as
 * they are when there is nothing to remove. A WebP's ranges lie inside its RIFF payload, so its RIFF size stays above
 * the bytes removed.
 */
export function plainColourImage(data: Uint8Array, info: ImageInfo): Uint8Array {
  const webp = isExtendedWebp(data, info);
  const webpFlags = webp ? (data[20] ?? 0) : 0;
  if (info.colourData.length === 0 && (webpFlags & webpIccFlag) === 0) return data;
  let removed = 0;
  for (const range of info.colourData) removed += range.end - range.start;
  const plain = new Uint8Array(data.length - removed);
  let from = 0;
  let to = 0;
  for (const range of info.colourData) {
    plain.set(data.subarray(from, range.start), to);
    to += range.start - from;
    from = range.end;
  }
  plain.set(data.subarray(from), to);
  if (webp) {
    const view = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
    view.setUint32(4, view.getUint32(4, true) - removed, true);
    plain[20] = webpFlags & ~webpIccFlag;
  }
  return plain;
}

/** A WebP whose first chunk is VP8X, the only kind with flags and ICCP chunks. */
function isExtendedWebp(data: Uint8Array, info: ImageInfo): boolean {
  return (
    info.mime === "image/webp" &&
    data.length > 20 &&
    data[12] === 0x56 &&
    data[13] === 0x50 &&
    data[14] === 0x38 &&
    data[15] === 0x58
  );
}
