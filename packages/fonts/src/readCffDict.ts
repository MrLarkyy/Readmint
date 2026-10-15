import { MalformedFont } from "./MalformedFont.js";

/** Operators of a CFF DICT, an escaped operator `12 n` keyed as `1200 + n`. */
export type CffDict = ReadonlyMap<number, readonly number[]>;

const maxOperands = 48;
const realNibbles = "0123456789.EE?-";

/** Parses a CFF DICT; operands beyond 48 or an unknown byte are `MalformedFont`. */
export function readCffDict(bytes: Uint8Array): CffDict {
  const dict = new Map<number, number[]>();
  let operands: number[] = [];
  let position = 0;
  const byte = () => {
    const value = bytes[position++];
    if (value === undefined) throw new MalformedFont("CFF DICT ends inside an operand");
    return value;
  };
  while (position < bytes.length) {
    const b0 = byte();
    if (b0 <= 21) {
      const operator = b0 === 12 ? 1200 + byte() : b0;
      dict.set(operator, operands);
      operands = [];
      continue;
    }
    if (operands.length >= maxOperands) throw new MalformedFont("CFF DICT has too many operands");
    if (b0 === 28) {
      const value = (byte() << 8) | byte();
      operands.push(value > 0x7fff ? value - 0x10000 : value);
    } else if (b0 === 29) {
      operands.push(((byte() << 24) | (byte() << 16) | (byte() << 8) | byte()) >> 0);
    } else if (b0 === 30) {
      operands.push(readReal(byte));
    } else if (b0 >= 32 && b0 <= 246) {
      operands.push(b0 - 139);
    } else if (b0 >= 247 && b0 <= 250) {
      operands.push((b0 - 247) * 256 + byte() + 108);
    } else if (b0 >= 251 && b0 <= 254) {
      operands.push(-(b0 - 251) * 256 - byte() - 108);
    } else {
      throw new MalformedFont("CFF DICT has an invalid byte");
    }
  }
  return dict;
}

function readReal(byte: () => number): number {
  let text = "";
  for (let count = 0; count < 32; count++) {
    const value = byte();
    for (const nibble of [value >> 4, value & 0x0f]) {
      if (nibble === 0x0f) {
        const parsed = Number(text);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      if (nibble === 0x0d) throw new MalformedFont("CFF DICT real has a reserved nibble");
      text += nibble === 0x0c ? "E-" : (realNibbles[nibble] ?? "");
    }
  }
  throw new MalformedFont("CFF DICT real is too long");
}

/** The operand of a single-operand operator, or `fallback`; it must be a non-negative integer offset or count. */
export function dictOffset(dict: CffDict, operator: number, fallback?: number): number {
  const value = dict.get(operator)?.[0] ?? fallback;
  if (value === undefined || !Number.isInteger(value) || value < 0) {
    throw new MalformedFont(`CFF DICT operator ${String(operator)} is missing or invalid`);
  }
  return value;
}
