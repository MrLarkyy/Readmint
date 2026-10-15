/** EXIF orientation: 1 is upright, 2-8 mirror and/or turn the stored pixels, 5-8 swap their width and height. */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** The Orientation entries in IFD0 of one EXIF block (a TIFF structure inside the image file). */
export interface OrientationField {
  /** The first entry a decoder applies (SHORT, count 1, value 1-8); 1 when none qualifies. */
  readonly orientation: Orientation;
  readonly littleEndian: boolean;
  /** File offsets of every 12-byte IFD0 entry tagged Orientation, whatever its type, count or value. */
  readonly entries: readonly number[];
  /** A PNG `eXIf` chunk: its CRC-32 covers the bytes from `start` up to `end`, where the CRC itself is stored. */
  readonly checksum?: { readonly start: number; readonly end: number };
}

const orientationTag = 0x0112;
const shortType = 3;
/** `Exif` and a zero byte; the sixth byte of the prefix, meant to be 0, is not checked, as decoders do not. */
const exifPrefix = [0x45, 0x78, 0x69, 0x66, 0];
const exifPrefixLength = 6;

/**
 * Reads IFD0 of the EXIF block at `start` up to `end` (clamped to the data; a six-byte `Exif\0` prefix is skipped, as
 * some writers put it in PNG and WebP too). Every read stays inside the block, so a broken or crafted block just yields
 * orientation 1 and the entries found within bounds, never an error; IFD0 is walked once, its entries bounded by the
 * block's size.
 */
export function exifOrientation(data: Uint8Array, start: number, end: number): OrientationField {
  const limit = Math.min(end, data.length);
  const prefixed =
    start + exifPrefixLength <= limit &&
    exifPrefix.every((byte, index) => data[start + index] === byte);
  const tiff = prefixed ? start + exifPrefixLength : start;
  const none: OrientationField = { orientation: 1, littleEndian: false, entries: [] };
  if (tiff + 8 > limit) return none;
  const order = String.fromCharCode(data[tiff] ?? 0, data[tiff + 1] ?? 0);
  if (order !== "II" && order !== "MM") return none;
  const littleEndian = order === "II";
  const u16 = (offset: number): number => {
    const a = data[offset] ?? 0;
    const b = data[offset + 1] ?? 0;
    return littleEndian ? a | (b << 8) : (a << 8) | b;
  };
  const u32 = (offset: number): number =>
    littleEndian ? u16(offset) + u16(offset + 2) * 65_536 : u16(offset) * 65_536 + u16(offset + 2);
  if (u16(tiff + 2) !== 42) return { ...none, littleEndian };
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > limit) return { ...none, littleEndian };
  const count = u16(ifd);
  const entries: number[] = [];
  let orientation: Orientation | undefined;
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > limit) break;
    if (u16(entry) !== orientationTag) continue;
    entries.push(entry);
    if (orientation === undefined && u16(entry + 2) === shortType && u32(entry + 4) === 1) {
      orientation = asOrientation(u16(entry + 8));
    }
  }
  return { orientation: orientation ?? 1, littleEndian, entries };
}

function asOrientation(value: number): Orientation {
  return value >= 1 && value <= 8 ? (value as Orientation) : 1;
}
