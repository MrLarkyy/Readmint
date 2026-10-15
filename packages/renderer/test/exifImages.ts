import { crc32 } from "../src/crc32.js";

/** One 12-byte IFD entry; `value` is written as a SHORT for type 3, as a LONG otherwise. */
export interface IfdEntry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly value: number;
}

export interface TiffOptions {
  readonly littleEndian?: boolean;
  /** The entry count IFD0 declares, when it should differ from the entries written. */
  readonly declared?: number;
  /** A second IFD (IFD1, the thumbnail's) right after IFD0. */
  readonly ifd1?: readonly IfdEntry[];
}

export const orientationEntry = (value: number, type = 3, count = 1): IfdEntry => ({
  tag: 0x0112,
  type,
  count,
  value,
});

/** A TIFF structure as EXIF blocks hold it: header, IFD0 with `entries`, optionally IFD1. */
export function tiff(entries: readonly IfdEntry[], options: TiffOptions = {}): Uint8Array {
  const littleEndian = options.littleEndian ?? false;
  const ifdOffset = 8;
  const ifd1 = options.ifd1 ?? [];
  const ifd0Size = 2 + entries.length * 12 + 4;
  const ifd1Offset = ifdOffset + ifd0Size;
  const size = ifd1Offset + (ifd1.length === 0 ? 0 : 2 + ifd1.length * 12 + 4);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  bytes.set(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, ifdOffset, littleEndian);
  const writeIfd = (at: number, list: readonly IfdEntry[], declared: number, next: number) => {
    view.setUint16(at, declared, littleEndian);
    list.forEach((entry, index) => {
      const offset = at + 2 + index * 12;
      view.setUint16(offset, entry.tag, littleEndian);
      view.setUint16(offset + 2, entry.type, littleEndian);
      view.setUint32(offset + 4, entry.count, littleEndian);
      if (entry.type === 3) view.setUint16(offset + 8, entry.value, littleEndian);
      else view.setUint32(offset + 8, entry.value, littleEndian);
    });
    view.setUint32(at + 2 + list.length * 12, next, littleEndian);
  };
  writeIfd(
    ifdOffset,
    entries,
    options.declared ?? entries.length,
    ifd1.length === 0 ? 0 : ifd1Offset,
  );
  if (ifd1.length > 0) writeIfd(ifd1Offset, ifd1, ifd1.length, 0);
  return bytes;
}

/** IFD0 holding just an Orientation entry of `value`. */
export const orientationTiff = (value: number, littleEndian = false): Uint8Array =>
  tiff([orientationEntry(value)], { littleEndian });

function concat(...parts: readonly (Uint8Array | readonly number[])[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const ascii = (text: string): number[] => Array.from(text, (char) => char.charCodeAt(0));

const u32be = (value: number): number[] => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];

/** A PNG chunk with a valid CRC. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat(ascii(type), data);
  return concat(u32be(data.length), body, u32be(crc32(body)));
}

/** `png` with an `eXIf` chunk holding `block`, right after IHDR or right before IEND. */
export function pngWithExif(
  png: Uint8Array,
  block: Uint8Array,
  at: "before-data" | "after-data" = "before-data",
): Uint8Array {
  const offset = at === "before-data" ? 33 : png.length - 12;
  return concat(png.subarray(0, offset), pngChunk("eXIf", block), png.subarray(offset));
}

/** `jpeg` with an APP1 `Exif` segment holding `block` right after SOI. */
export function jpegWithExif(jpeg: Uint8Array, block: Uint8Array): Uint8Array {
  const length = 2 + 6 + block.length;
  return concat(
    jpeg.subarray(0, 2),
    [0xff, 0xe1, length >> 8, length & 255],
    ascii("Exif\0\0"),
    block,
    jpeg.subarray(2),
  );
}

/** Bytes of a base64 `data:` URI; atob runs the same in Node and the browser test project. */
export function dataUriBytes(uri: string): Uint8Array {
  const binary = atob(uri.slice(uri.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function toDataUri(mime: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}
