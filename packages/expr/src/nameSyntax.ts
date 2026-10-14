/** The name grammar shared by the tokenizer and the checks of local names. */
export function isDigit(unit: number): boolean {
  return unit >= 0x30 && unit <= 0x39;
}

export function isNameStart(unit: number): boolean {
  return (unit >= 0x41 && unit <= 0x5a) || (unit >= 0x61 && unit <= 0x7a) || unit === 0x5f;
}

/**
 * The end of the name starting at `start`. `-` joins a name only when a letter or `_` follows:
 * `my-label` is one name, `x-1` a subtraction.
 */
export function scanName(source: string, start: number): number {
  let index = start + 1;
  for (;;) {
    const unit = source.charCodeAt(index);
    if (isNameStart(unit) || isDigit(unit)) {
      index++;
    } else if (unit === 0x2d && isNameStart(source.charCodeAt(index + 1))) {
      index += 2;
    } else {
      return index;
    }
  }
}

const literals: ReadonlySet<string> = new Set(["true", "false", "null"]);

/** Whether an expression can refer to `text` as a name: the whole of it scans as one name. */
export function isName(text: string): boolean {
  if (text.length === 0 || !isNameStart(text.charCodeAt(0))) return false;
  return scanName(text, 0) === text.length && !literals.has(text);
}
