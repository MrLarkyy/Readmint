const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const digits = new Map(
  Array.from({ length: alphabet.length }, (_, index): [string, number] => [
    alphabet.charAt(index),
    index,
  ]),
);

/** The numbers of a varint string of ucdTables.ts: five bits per character, least significant first. */
export function decodeVarints(text: string): number[] {
  const numbers: number[] = [];
  let value = 0;
  let scale = 1;
  for (let position = 0; position < text.length; position++) {
    const char = text.charAt(position);
    const digit = digits.get(char);
    if (digit === undefined) throw new Error(`invalid varint character ${char}`);
    value += (digit & 31) * scale;
    if (digit < 32) {
      numbers.push(value);
      value = 0;
      scale = 1;
    } else {
      scale *= 32;
    }
  }
  return numbers;
}

/** The pairs of a pair table of ucdTables.ts: code point -> other code point. */
export function decodePairs(text: string): Map<number, number> {
  const numbers = decodeVarints(text);
  const pairs = new Map<number, number>();
  let codePoint = 0;
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    codePoint += numbers[index] ?? 0;
    const zigzag = numbers[index + 1] ?? 0;
    pairs.set(codePoint, codePoint + (zigzag % 2 === 0 ? zigzag / 2 : -(zigzag + 1) / 2));
  }
  return pairs;
}
