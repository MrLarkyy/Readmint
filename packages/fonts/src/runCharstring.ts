import type { CffIndex } from "./CffIndex.js";
import type { GlyphOutline, OutlineCommand } from "./GlyphOutline.js";
import { MalformedFont } from "./MalformedFont.js";

/** What a Type 2 charstring of one glyph may refer to. */
export interface CharstringSource {
  charString(glyph: number): Uint8Array;
  readonly globalSubrs: CffIndex;
  localSubrs(glyph: number): CffIndex | undefined;
  /** The glyph a Standard Encoding code names, for `seac`; undefined when the font has none. */
  standardGlyph(code: number): number | undefined;
}

/** Bounds a real charstring never comes near; a crafted one stops here. */
export const maxStack = 48;
export const maxCallDepth = 10;
export const maxOperations = 20_000;

/**
 * The outline a Type 2 charstring draws, flattened to M/L/C/Z in font units: subroutines inlined, hints skipped,
 * `seac` accents composed. The width is skipped (hmtx is the source of advances).
 */
export function runCharstring(source: CharstringSource, glyph: number): GlyphOutline {
  return new Interpreter(source, glyph, true).run();
}

function bias(subrs: CffIndex): number {
  return subrs.count < 1240 ? 107 : subrs.count < 33900 ? 1131 : 32768;
}

class Interpreter {
  private readonly stack: number[] = [];
  private readonly out: OutlineCommand[] = [];
  private x = 0;
  private y = 0;
  private stems = 0;
  private widthTaken = false;
  private open = false;
  private ended = false;
  private operations = 0;
  private readonly local: CffIndex | undefined;

  constructor(
    private readonly source: CharstringSource,
    private readonly glyph: number,
    private readonly allowSeac: boolean,
  ) {
    this.local = source.localSubrs(glyph);
  }

  run(): GlyphOutline {
    this.execute(this.source.charString(this.glyph), 0);
    this.close();
    return this.out;
  }

  private execute(code: Uint8Array, depth: number): void {
    if (depth > maxCallDepth) throw new MalformedFont("CFF subroutines nest too deep");
    let position = 0;
    const next = () => {
      const value = code[position++];
      if (value === undefined) throw new MalformedFont("CFF charstring ends inside an operand");
      return value;
    };
    while (position < code.length && !this.ended) {
      if (++this.operations > maxOperations)
        throw new MalformedFont("CFF charstring runs too long");
      const b0 = next();
      if (b0 >= 32 || b0 === 28) {
        this.push(readNumber(b0, next));
        continue;
      }
      if (b0 === 11) return;
      if (b0 === 10 || b0 === 29) {
        const subrs = b0 === 10 ? this.local : this.source.globalSubrs;
        if (subrs === undefined)
          throw new MalformedFont("CFF charstring calls a missing subroutine");
        const index = this.pop() + bias(subrs);
        this.execute(subrs.item(index), depth + 1);
        continue;
      }
      if (b0 === 19 || b0 === 20) {
        this.hintmask();
        position += (this.stems + 7) >> 3;
        continue;
      }
      this.operator(b0 === 12 ? 1200 + next() : b0);
    }
  }

  private push(value: number): void {
    if (this.stack.length >= maxStack) throw new MalformedFont("CFF charstring stack overflows");
    this.stack.push(value);
  }

  private pop(): number {
    const value = this.stack.pop();
    if (value === undefined) throw new MalformedFont("CFF charstring stack underflows");
    return value;
  }

  private takeWidth(when: boolean): void {
    if (!this.widthTaken && when) this.stack.shift();
    this.widthTaken = true;
  }

  private hintmask(): void {
    this.takeWidth(this.stack.length % 2 === 1);
    this.stems += this.stack.length >> 1;
    this.stack.length = 0;
  }

  private operator(op: number): void {
    const s = this.stack;
    switch (op) {
      case 1:
      case 3:
      case 18:
      case 23:
        this.hintmask();
        return;
      case 21:
        this.takeWidth(s.length > 2);
        this.moveTo(arg(s, 0), arg(s, 1));
        break;
      case 22:
        this.takeWidth(s.length > 1);
        this.moveTo(arg(s, 0), 0);
        break;
      case 4:
        this.takeWidth(s.length > 1);
        this.moveTo(0, arg(s, 0));
        break;
      case 5:
        for (let i = 0; i + 1 < s.length; i += 2) this.lineTo(arg(s, i), arg(s, i + 1));
        break;
      case 6:
      case 7:
        this.alternatingLines(op === 6);
        break;
      case 8:
        for (let i = 0; i + 5 < s.length; i += 6) this.curveAt(i);
        break;
      case 24: {
        let i = 0;
        for (; i + 7 < s.length; i += 6) this.curveAt(i);
        this.lineTo(arg(s, i), arg(s, i + 1));
        break;
      }
      case 25: {
        let i = 0;
        for (; i + 7 < s.length; i += 2) this.lineTo(arg(s, i), arg(s, i + 1));
        this.curveAt(i);
        break;
      }
      case 26:
      case 27:
        this.straightCurves(op === 27);
        break;
      case 30:
      case 31:
        this.alternatingCurves(op === 30);
        break;
      case 14:
        this.endchar();
        break;
      case 1234:
      case 1235:
      case 1236:
      case 1237:
        this.flex(op);
        break;
      default:
        throw new MalformedFont(`CFF charstring uses unsupported operator ${String(op)}`);
    }
    s.length = 0;
  }

  private moveTo(dx: number, dy: number): void {
    this.close();
    this.x += dx;
    this.y += dy;
    this.out.push({ type: "M", x: this.x, y: this.y });
    this.open = true;
  }

  private lineTo(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.out.push({ type: "L", x: this.x, y: this.y });
  }

  private curve(
    dx1: number,
    dy1: number,
    dx2: number,
    dy2: number,
    dx3: number,
    dy3: number,
  ): void {
    const x1 = this.x + dx1;
    const y1 = this.y + dy1;
    const x2 = x1 + dx2;
    const y2 = y1 + dy2;
    this.x = x2 + dx3;
    this.y = y2 + dy3;
    this.out.push({ type: "C", x1, y1, x2, y2, x: this.x, y: this.y });
  }

  private curveAt(i: number): void {
    const s = this.stack;
    this.curve(
      arg(s, i),
      arg(s, i + 1),
      arg(s, i + 2),
      arg(s, i + 3),
      arg(s, i + 4),
      arg(s, i + 5),
    );
  }

  private close(): void {
    if (this.open) this.out.push({ type: "Z" });
    this.open = false;
  }

  private alternatingLines(horizontal: boolean): void {
    let across = horizontal;
    for (const value of this.stack) {
      if (across) this.lineTo(value, 0);
      else this.lineTo(0, value);
      across = !across;
    }
  }

  /** hhcurveto (horizontal) and vvcurveto: an odd first operand bends the first curve. */
  private straightCurves(horizontal: boolean): void {
    const s = this.stack;
    let i = s.length % 2;
    let first = i === 1 ? arg(s, 0) : 0;
    for (; i + 3 < s.length; i += 4) {
      if (horizontal) this.curve(arg(s, i), first, arg(s, i + 1), arg(s, i + 2), arg(s, i + 3), 0);
      else this.curve(first, arg(s, i), arg(s, i + 1), arg(s, i + 2), 0, arg(s, i + 3));
      first = 0;
    }
  }

  /** vhcurveto (vertical first) and hvcurveto: tangents alternate; a fifth operand ends the last curve. */
  private alternatingCurves(verticalFirst: boolean): void {
    const s = this.stack;
    let vertical = verticalFirst;
    for (let i = 0; i + 3 < s.length; i += 4) {
      const last = s.length - i === 5 ? arg(s, i + 4) : 0;
      if (vertical) this.curve(0, arg(s, i), arg(s, i + 1), arg(s, i + 2), arg(s, i + 3), last);
      else this.curve(arg(s, i), 0, arg(s, i + 1), arg(s, i + 2), last, arg(s, i + 3));
      vertical = !vertical;
    }
  }

  private flex(op: number): void {
    const a = (index: number) => arg(this.stack, index);
    if (op === 1235) {
      this.curve(a(0), a(1), a(2), a(3), a(4), a(5));
      this.curve(a(6), a(7), a(8), a(9), a(10), a(11));
    } else if (op === 1234) {
      this.curve(a(0), 0, a(1), a(2), a(3), 0);
      this.curve(a(4), 0, a(5), -a(2), a(6), 0);
    } else if (op === 1236) {
      this.curve(a(0), a(1), a(2), a(3), a(4), 0);
      this.curve(a(5), 0, a(6), a(7), a(8), -(a(1) + a(3) + a(7)));
    } else {
      const dx = a(0) + a(2) + a(4) + a(6) + a(8);
      const dy = a(1) + a(3) + a(5) + a(7) + a(9);
      const horizontal = Math.abs(dx) > Math.abs(dy);
      this.curve(a(0), a(1), a(2), a(3), a(4), a(5));
      this.curve(a(6), a(7), a(8), a(9), horizontal ? a(10) : -dx, horizontal ? -dy : a(10));
    }
  }

  private endchar(): void {
    const s = this.stack;
    this.takeWidth(s.length === 1 || s.length === 5);
    this.close();
    this.ended = true;
    if (s.length !== 4) return;
    if (!this.allowSeac) throw new MalformedFont("CFF seac accent refers to another seac");
    const [adx = 0, ady = 0, base = 0, accent = 0] = s;
    this.out.push(...this.component(base, 0, 0), ...this.component(accent, adx, ady));
  }

  private component(code: number, dx: number, dy: number): OutlineCommand[] {
    const glyph = this.source.standardGlyph(code);
    if (glyph === undefined)
      throw new MalformedFont("CFF seac names a glyph the font does not have");
    const outline = new Interpreter(this.source, glyph, false);
    outline.operations = this.operations;
    const commands = outline.run();
    this.operations = outline.operations;
    return commands.map((command) => moved(command, dx, dy));
  }
}

function arg(stack: readonly number[], index: number): number {
  const value = stack[index];
  if (value === undefined) throw new MalformedFont("CFF charstring operator lacks operands");
  return value;
}

function readNumber(b0: number, next: () => number): number {
  if (b0 === 28) {
    const value = (next() << 8) | next();
    return value > 0x7fff ? value - 0x10000 : value;
  }
  if (b0 <= 246) return b0 - 139;
  if (b0 <= 250) return (b0 - 247) * 256 + next() + 108;
  if (b0 <= 254) return -(b0 - 251) * 256 - next() - 108;
  return ((next() << 24) | (next() << 16) | (next() << 8) | next()) / 65536;
}

function moved(command: OutlineCommand, dx: number, dy: number): OutlineCommand {
  switch (command.type) {
    case "Z":
      return command;
    case "M":
    case "L":
      return { type: command.type, x: command.x + dx, y: command.y + dy };
    case "Q":
      return {
        ...command,
        x1: command.x1 + dx,
        y1: command.y1 + dy,
        x: command.x + dx,
        y: command.y + dy,
      };
    case "C":
      return {
        ...command,
        x1: command.x1 + dx,
        y1: command.y1 + dy,
        x2: command.x2 + dx,
        y2: command.y2 + dy,
        x: command.x + dx,
        y: command.y + dy,
      };
  }
}
