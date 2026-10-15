import type { GlyphOutline, OutlineCommand } from "./GlyphOutline.js";
import { MalformedFont } from "./MalformedFont.js";
import type { OutlineBudget } from "./OutlineBudget.js";
import { SfntReader } from "./SfntReader.js";

/** Points of a TrueType glyph: coordinates, on-curve flags and the last point index of each contour. */
interface GlyphPoints {
  readonly xs: number[];
  readonly ys: number[];
  readonly on: boolean[];
  readonly ends: number[];
}

/** Nesting a real font uses stays far below these; a crafted one stops here instead of recursing. */
export const maxComponentDepth = 8;
export const maxComponents = 256;
export const maxPoints = 0xffff;

const argsAreWords = 0x0001;
const argsAreXy = 0x0002;
const haveScale = 0x0008;
const moreComponents = 0x0020;
const haveXyScale = 0x0040;
const haveTwoByTwo = 0x0080;
const scaledOffset = 0x0800;
const unscaledOffset = 0x1000;

interface Budget {
  components: number;
  readonly path: number[];
}

/** TrueType outlines (glyf + loca); every glyph is read on request, bounds-checked. */
export class GlyfTable {
  private readonly glyf: SfntReader;
  private readonly loca: SfntReader;

  constructor(
    glyf: Uint8Array,
    loca: Uint8Array,
    private readonly longOffsets: boolean,
    readonly numGlyphs: number,
  ) {
    this.glyf = new SfntReader(glyf);
    this.loca = new SfntReader(loca);
  }

  /** The glyph's bytes in glyf; empty for a glyph without outline. */
  data(glyph: number): Uint8Array {
    if (!Number.isInteger(glyph) || glyph < 0 || glyph >= this.numGlyphs) {
      throw new MalformedFont(`glyph ${String(glyph)} is outside the font`);
    }
    const start = this.offset(glyph);
    const end = this.offset(glyph + 1);
    if (end < start) throw new MalformedFont("font loca offsets go backwards");
    return this.glyf.slice(start, end - start);
  }

  outline(glyph: number, budget?: OutlineBudget): GlyphOutline {
    const points = this.points(glyph, { components: 0, path: [] });
    budget?.spend(points.xs.length + 1);
    return toOutline(points);
  }

  /** Glyphs a composite glyph draws directly (empty for a simple or empty glyph). */
  components(glyph: number): number[] {
    const data = this.data(glyph);
    if (data.length < 10) return [];
    const reader = new SfntReader(data);
    if (reader.i16(0) >= 0) return [];
    const found: number[] = [];
    forEachComponent(reader, (flags, offset) => {
      found.push(reader.u16(offset + 2));
      if (found.length > maxComponents)
        throw new MalformedFont("composite glyph has too many components");
      return componentLength(flags);
    });
    return found;
  }

  private offset(index: number): number {
    return this.longOffsets ? this.loca.u32(index * 4) : this.loca.u16(index * 2) * 2;
  }

  private points(glyph: number, budget: Budget): GlyphPoints {
    if (budget.path.includes(glyph)) throw new MalformedFont("composite glyph refers to itself");
    if (budget.path.length > maxComponentDepth) {
      throw new MalformedFont("composite glyphs nest too deep");
    }
    const data = this.data(glyph);
    if (data.length === 0) return { xs: [], ys: [], on: [], ends: [] };
    const reader = new SfntReader(data);
    const contours = reader.i16(0);
    if (contours >= 0) return readSimple(reader, contours);
    budget.path.push(glyph);
    const points = this.composite(reader, budget);
    budget.path.pop();
    return points;
  }

  private composite(reader: SfntReader, budget: Budget): GlyphPoints {
    const result: GlyphPoints = { xs: [], ys: [], on: [], ends: [] };
    forEachComponent(reader, (flags, offset) => {
      budget.components++;
      if (budget.components > maxComponents) {
        throw new MalformedFont("composite glyph has too many components");
      }
      const child = this.points(reader.u16(offset + 2), budget);
      append(result, child, flags, readTransform(reader, flags, offset));
      return componentLength(flags);
    });
    return result;
  }
}

interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly arg1: number;
  readonly arg2: number;
}

/** Calls `visit(flags, offset)` per component; `visit` returns the component's length in bytes. */
function forEachComponent(
  reader: SfntReader,
  visit: (flags: number, offset: number) => number,
): void {
  let offset = 10;
  let flags = moreComponents;
  while ((flags & moreComponents) !== 0) {
    flags = reader.u16(offset);
    offset += visit(flags, offset);
  }
}

/** Bytes of one composite component record with these flags. */
export function componentLength(flags: number): number {
  const args = (flags & argsAreWords) !== 0 ? 4 : 2;
  const scale =
    (flags & haveScale) !== 0
      ? 2
      : (flags & haveXyScale) !== 0
        ? 4
        : (flags & haveTwoByTwo) !== 0
          ? 8
          : 0;
  return 4 + args + scale;
}

function readTransform(reader: SfntReader, flags: number, offset: number): Transform {
  let at = offset + 4;
  const words = (flags & argsAreWords) !== 0;
  const signed = (flags & argsAreXy) !== 0;
  const arg = () => {
    const value = words
      ? signed
        ? reader.i16(at)
        : reader.u16(at)
      : signed
        ? reader.i8(at)
        : reader.u8(at);
    at += words ? 2 : 1;
    return value;
  };
  const arg1 = arg();
  const arg2 = arg();
  const f2dot14 = () => {
    const value = reader.i16(at) / 16384;
    at += 2;
    return value;
  };
  if ((flags & haveScale) !== 0) {
    const scale = f2dot14();
    return { a: scale, b: 0, c: 0, d: scale, arg1, arg2 };
  }
  if ((flags & haveXyScale) !== 0) {
    const a = f2dot14();
    return { a, b: 0, c: 0, d: f2dot14(), arg1, arg2 };
  }
  if ((flags & haveTwoByTwo) !== 0) {
    const a = f2dot14();
    const b = f2dot14();
    const c = f2dot14();
    return { a, b, c, d: f2dot14(), arg1, arg2 };
  }
  return { a: 1, b: 0, c: 0, d: 1, arg1, arg2 };
}

/** Adds a component's points, transformed and moved by its offset or by matching two points. */
function append(target: GlyphPoints, child: GlyphPoints, flags: number, t: Transform): void {
  const xs = child.xs.map((x, index) => t.a * x + t.c * (child.ys[index] ?? 0));
  const ys = child.ys.map((y, index) => t.b * (child.xs[index] ?? 0) + t.d * y);
  let dx: number;
  let dy: number;
  if ((flags & argsAreXy) !== 0) {
    dx = t.arg1;
    dy = t.arg2;
    if ((flags & scaledOffset) !== 0 && (flags & unscaledOffset) === 0) {
      dx = t.a * t.arg1 + t.c * t.arg2;
      dy = t.b * t.arg1 + t.d * t.arg2;
    }
  } else {
    const parentX = target.xs[t.arg1];
    const parentY = target.ys[t.arg1];
    const childX = xs[t.arg2];
    const childY = ys[t.arg2];
    if (
      parentX === undefined ||
      parentY === undefined ||
      childX === undefined ||
      childY === undefined
    ) {
      throw new MalformedFont("composite glyph matches a point it does not have");
    }
    dx = parentX - childX;
    dy = parentY - childY;
  }
  if (target.xs.length + xs.length > maxPoints)
    throw new MalformedFont("glyph has too many points");
  const base = target.xs.length;
  for (let index = 0; index < xs.length; index++) {
    target.xs.push((xs[index] ?? 0) + dx);
    target.ys.push((ys[index] ?? 0) + dy);
    target.on.push(child.on[index] ?? true);
  }
  for (const end of child.ends) target.ends.push(base + end);
}

function readSimple(reader: SfntReader, contours: number): GlyphPoints {
  const ends: number[] = [];
  for (let index = 0; index < contours; index++) {
    const end = reader.u16(10 + index * 2);
    if (end < (ends.at(-1) ?? -1)) throw new MalformedFont("glyph contour ends go backwards");
    ends.push(end);
  }
  const count = (ends.at(-1) ?? -1) + 1;
  let offset = 10 + contours * 2;
  offset += 2 + reader.u16(offset);
  const flags: number[] = [];
  while (flags.length < count) {
    const flag = reader.u8(offset++);
    flags.push(flag);
    if ((flag & 0x08) !== 0) {
      const repeat = reader.u8(offset++);
      for (let index = 0; index < repeat && flags.length < count; index++) flags.push(flag);
    }
  }
  const xs: number[] = [];
  const ys: number[] = [];
  offset = readCoordinates(reader, offset, flags, 0x02, 0x10, xs);
  readCoordinates(reader, offset, flags, 0x04, 0x20, ys);
  return { xs, ys, on: flags.map((flag) => (flag & 0x01) !== 0), ends };
}

function readCoordinates(
  reader: SfntReader,
  start: number,
  flags: readonly number[],
  short: number,
  same: number,
  into: number[],
): number {
  let offset = start;
  let value = 0;
  for (const flag of flags) {
    if ((flag & short) !== 0) {
      const delta = reader.u8(offset++);
      value += (flag & same) !== 0 ? delta : -delta;
    } else if ((flag & same) === 0) {
      value += reader.i16(offset);
      offset += 2;
    }
    into.push(value);
  }
  return offset;
}

/** Quadratic contours as M/L/Q/Z: two off-curve points in a row imply the on-curve point between them. */
function toOutline(points: GlyphPoints): GlyphOutline {
  const commands: OutlineCommand[] = [];
  let start = 0;
  for (const end of points.ends) {
    if (end >= start) contour(points, start, end, commands);
    start = end + 1;
  }
  return commands;
}

function contour(points: GlyphPoints, first: number, last: number, out: OutlineCommand[]): void {
  const at = (index: number) => ({
    x: points.xs[index] ?? 0,
    y: points.ys[index] ?? 0,
    on: points.on[index] ?? true,
  });
  const head = at(first);
  const tail = at(last);
  let from = first;
  let to = last;
  let origin: { x: number; y: number };
  if (head.on) {
    origin = head;
    from = first + 1;
  } else if (tail.on) {
    origin = tail;
    to = last - 1;
  } else {
    origin = { x: (head.x + tail.x) / 2, y: (head.y + tail.y) / 2 };
  }
  out.push({ type: "M", x: origin.x, y: origin.y });
  let control: { x: number; y: number } | undefined;
  for (let index = from; index <= to; index++) {
    const point = at(index);
    if (point.on) {
      out.push(
        control === undefined
          ? { type: "L", x: point.x, y: point.y }
          : { type: "Q", x1: control.x, y1: control.y, x: point.x, y: point.y },
      );
      control = undefined;
    } else {
      if (control !== undefined) {
        const mid = { x: (control.x + point.x) / 2, y: (control.y + point.y) / 2 };
        out.push({ type: "Q", x1: control.x, y1: control.y, x: mid.x, y: mid.y });
      }
      control = point;
    }
  }
  if (control !== undefined) {
    out.push({ type: "Q", x1: control.x, y1: control.y, x: origin.x, y: origin.y });
  }
  out.push({ type: "Z" });
}
