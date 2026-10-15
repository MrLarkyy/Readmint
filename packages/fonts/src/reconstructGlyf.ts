import { ByteCursor } from "./ByteCursor.js";
import { ByteWriter } from "./ByteWriter.js";
import { FontRefused } from "./FontRefused.js";
import { MalformedFont } from "./MalformedFont.js";

export interface ReconstructedGlyf {
  readonly glyf: Uint8Array;
  readonly loca: Uint8Array;
  readonly indexFormat: number;
  readonly numGlyphs: number;
  /** Bounding box xMin of every glyph (0 for an empty one): what a transformed hmtx leaves out. */
  readonly xMins: Int16Array;
}

interface Streams {
  readonly contours: ByteCursor;
  readonly points: ByteCursor;
  readonly flags: ByteCursor;
  readonly glyphs: ByteCursor;
  readonly composites: ByteCursor;
  readonly bboxes: ByteCursor;
  readonly instructions: ByteCursor;
  readonly bboxBitmap: Uint8Array;
  readonly overlapBitmap: Uint8Array | undefined;
}

const headerSize = 36;
const moreComponents = 0x0020;
const haveInstructions = 0x0100;

/**
 * The glyf and loca tables of a WOFF2 transformed glyf table (WOFF2 5.1). Every stream read is bounded by its
 * declared size, every point consumes input, and the output is checked against `maxBytes` glyph by glyph.
 */
export function reconstructGlyf(data: Uint8Array, maxBytes: number): ReconstructedGlyf {
  const header = new ByteCursor(data);
  header.u16();
  const options = header.u16();
  const numGlyphs = header.u16();
  const indexFormat = header.u16();
  if (indexFormat > 1) throw new MalformedFont("WOFF2 glyf index format is neither 0 nor 1");
  const streams = readStreams(data, header, numGlyphs, (options & 1) !== 0);
  const out = new ByteWriter(data.length * 2);
  const offsets = new Array<number>(numGlyphs + 1);
  const xMins = new Int16Array(numGlyphs);
  for (let glyph = 0; glyph < numGlyphs; glyph++) {
    offsets[glyph] = out.length;
    xMins[glyph] = writeGlyph(out, streams, glyph);
    out.align4();
    if (out.length > maxBytes) throw FontRefused.tooLarge(out.length, maxBytes);
  }
  offsets[numGlyphs] = out.length;
  return {
    glyf: out.result(),
    loca: writeLoca(offsets, indexFormat),
    indexFormat,
    numGlyphs,
    xMins,
  };
}

function readStreams(
  data: Uint8Array,
  header: ByteCursor,
  numGlyphs: number,
  overlap: boolean,
): Streams {
  const sizes = { contours: header.u32(), points: header.u32(), flags: header.u32() };
  const moreSizes = { glyphs: header.u32(), composites: header.u32(), bboxes: header.u32() };
  const instructionSize = header.u32();
  let offset = headerSize;
  const next = (size: number) => {
    if (offset + size > data.length) throw new MalformedFont("WOFF2 glyf stream lies past the end");
    const cursor = new ByteCursor(data, offset, offset + size);
    offset += size;
    return cursor;
  };
  const contours = next(sizes.contours);
  const points = next(sizes.points);
  const flags = next(sizes.flags);
  const glyphs = next(moreSizes.glyphs);
  const composites = next(moreSizes.composites);
  const bboxes = next(moreSizes.bboxes);
  const instructions = next(instructionSize);
  const bboxBitmap = bboxes.take(((numGlyphs + 31) >> 5) * 4);
  const overlapLength = (numGlyphs + 7) >> 3;
  const overlapBitmap = overlap ? next(overlapLength).take(overlapLength) : undefined;
  return {
    contours,
    points,
    flags,
    glyphs,
    composites,
    bboxes,
    instructions,
    bboxBitmap,
    overlapBitmap,
  };
}

function bit(bitmap: Uint8Array | undefined, index: number): boolean {
  return bitmap !== undefined && ((bitmap[index >> 3] ?? 0) & (0x80 >> (index & 7))) !== 0;
}

/** Writes one glyph in glyf format; returns its xMin. */
function writeGlyph(out: ByteWriter, streams: Streams, glyph: number): number {
  const contours = streams.contours.i16();
  const hasBox = bit(streams.bboxBitmap, glyph);
  if (contours === 0) {
    if (hasBox) throw new MalformedFont("WOFF2 empty glyph has a bounding box");
    return 0;
  }
  if (contours < -1) throw new MalformedFont("WOFF2 glyph has a negative contour count");
  if (contours === -1) {
    if (!hasBox) throw new MalformedFont("WOFF2 composite glyph has no bounding box");
    return writeComposite(out, streams);
  }
  return writeSimple(out, streams, contours, hasBox, bit(streams.overlapBitmap, glyph));
}

function readBox(cursor: ByteCursor): [number, number, number, number] {
  return [cursor.i16(), cursor.i16(), cursor.i16(), cursor.i16()];
}

function writeComposite(out: ByteWriter, streams: Streams): number {
  const box = readBox(streams.bboxes);
  const composites = streams.composites;
  const start = composites.position;
  let instructions = false;
  let flags = moreComponents;
  while ((flags & moreComponents) !== 0) {
    flags = composites.u16();
    composites.u16();
    const args = (flags & 0x0001) !== 0 ? 4 : 2;
    const scale =
      (flags & 0x0008) !== 0 ? 2 : (flags & 0x0040) !== 0 ? 4 : (flags & 0x0080) !== 0 ? 8 : 0;
    composites.take(args + scale);
    if ((flags & haveInstructions) !== 0) instructions = true;
  }
  const length = composites.position - start;
  composites.position = start;
  out.i16(-1).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]).bytes(composites.take(length));
  if (instructions) {
    const count = streams.glyphs.uint255();
    out.u16(count).bytes(streams.instructions.take(count));
  }
  return box[0];
}

function writeSimple(
  out: ByteWriter,
  streams: Streams,
  contours: number,
  hasBox: boolean,
  overlap: boolean,
): number {
  const endPoints: number[] = [];
  let total = 0;
  for (let contour = 0; contour < contours; contour++) {
    total += streams.points.uint255();
    if (total > 0xffff) throw new MalformedFont("WOFF2 glyph has more than 65535 points");
    endPoints.push(total - 1);
  }
  const flagBytes = streams.flags.take(total);
  const xs = new Int32Array(total);
  const ys = new Int32Array(total);
  let x = 0;
  let y = 0;
  for (let point = 0; point < total; point++) {
    const [dx, dy] = triplet((flagBytes[point] ?? 0) & 0x7f, streams.glyphs);
    x += dx;
    y += dy;
    xs[point] = x;
    ys[point] = y;
  }
  const instructionCount = streams.glyphs.uint255();
  const instructions = streams.instructions.take(instructionCount);
  const box = hasBox ? readBox(streams.bboxes) : bounds(xs, ys);
  out.i16(contours).i16(box[0]).i16(box[1]).i16(box[2]).i16(box[3]);
  for (const end of endPoints) out.u16(end);
  out.u16(instructionCount).bytes(instructions);
  writePoints(out, flagBytes, xs, ys, overlap);
  return box[0];
}

function withSign(flag: number, value: number): number {
  return (flag & 1) !== 0 ? value : -value;
}

/** One WOFF2 coordinate triplet (WOFF2 5.2): the flag picks how many bytes follow and how they split. */
function triplet(flag: number, cursor: ByteCursor): [number, number] {
  if (flag < 10) return [0, withSign(flag, ((flag & 14) << 7) + cursor.u8())];
  if (flag < 20) return [withSign(flag, (((flag - 10) & 14) << 7) + cursor.u8()), 0];
  if (flag < 84) {
    const b0 = flag - 20;
    const b1 = cursor.u8();
    return [
      withSign(flag, 1 + (b0 & 0x30) + (b1 >> 4)),
      withSign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)),
    ];
  }
  if (flag < 120) {
    const b0 = flag - 84;
    const b1 = cursor.u8();
    const b2 = cursor.u8();
    return [
      withSign(flag, 1 + (Math.trunc(b0 / 12) << 8) + b1),
      withSign(flag >> 1, 1 + (((b0 % 12) >> 2) << 8) + b2),
    ];
  }
  if (flag < 124) {
    const b1 = cursor.u8();
    const b2 = cursor.u8();
    const b3 = cursor.u8();
    return [withSign(flag, (b1 << 4) + (b2 >> 4)), withSign(flag >> 1, ((b2 & 0x0f) << 8) + b3)];
  }
  const b1 = cursor.u8();
  const b2 = cursor.u8();
  const b3 = cursor.u8();
  const b4 = cursor.u8();
  return [withSign(flag, (b1 << 8) + b2), withSign(flag >> 1, (b3 << 8) + b4)];
}

function bounds(xs: Int32Array, ys: Int32Array): [number, number, number, number] {
  if (xs.length === 0) return [0, 0, 0, 0];
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let point = 0; point < xs.length; point++) {
    const x = xs[point] ?? 0;
    const y = ys[point] ?? 0;
    box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)];
  }
  for (const value of box) checkShort(value);
  return box;
}

function checkShort(value: number): number {
  if (value < -32768 || value > 32767) {
    throw new MalformedFont("WOFF2 glyph coordinate is outside 16 bits");
  }
  return value;
}

/** Flags without repeats, then x and y deltas, each as short or word as the size needs. */
function writePoints(
  out: ByteWriter,
  flagBytes: Uint8Array,
  xs: Int32Array,
  ys: Int32Array,
  overlap: boolean,
): void {
  const xOut = new ByteWriter(xs.length * 2);
  const yOut = new ByteWriter(ys.length * 2);
  let previousX = 0;
  let previousY = 0;
  for (let point = 0; point < xs.length; point++) {
    const x = xs[point] ?? 0;
    const y = ys[point] ?? 0;
    let flag = ((flagBytes[point] ?? 0) & 0x80) === 0 ? 0x01 : 0;
    if (point === 0 && overlap) flag |= 0x40;
    flag |= delta(xOut, checkShort(x - previousX), 0x02, 0x10);
    flag |= delta(yOut, checkShort(y - previousY), 0x04, 0x20);
    out.u8(flag);
    previousX = x;
    previousY = y;
  }
  out.bytes(xOut.result()).bytes(yOut.result());
}

function delta(out: ByteWriter, value: number, short: number, sameOrPositive: number): number {
  if (value === 0) return sameOrPositive;
  if (value >= -255 && value <= 255) {
    out.u8(Math.abs(value));
    return short | (value > 0 ? sameOrPositive : 0);
  }
  out.i16(value);
  return 0;
}

function writeLoca(offsets: readonly number[], indexFormat: number): Uint8Array {
  const out = new ByteWriter(offsets.length * 4);
  for (const offset of offsets) {
    if (indexFormat === 1) out.u32(offset);
    else if (offset / 2 > 0xffff)
      throw new MalformedFont("WOFF2 glyf is too long for a short loca");
    else out.u16(offset / 2);
  }
  return out.result();
}
