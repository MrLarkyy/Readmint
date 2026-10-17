/** A lexical token of a placeholder, only as fine as finding palette reads needs. */
type Token =
  | { readonly kind: "name"; readonly value: string }
  /** `value` is undefined when the literal holds an escape: such a key is never matched. */
  | { readonly kind: "string"; readonly value: string | undefined }
  | { readonly kind: "number" }
  | { readonly kind: "operator"; readonly value: string };

/**
 * The palette tokens `text` reads: inside each `{{ }}` placeholder, the name `palette` (not a property, so not
 * `x.palette`) followed by `.token` or `["token"]`. It scans like the expression tokenizer does, without parsing:
 * a string literal is skipped (a `palette.x` or `}}` inside one is text), text outside placeholders is never read,
 * and a computed key (`palette[name]`) or a key with an escape is not seen. Linear in the length of `text`.
 */
export function paletteReads(text: string): string[] {
  const reads: string[] = [];
  let position = 0;
  for (;;) {
    const open = text.indexOf("{{", position);
    if (open === -1) return reads;
    const placeholder = scanPlaceholder(text, open + 2);
    collectReads(placeholder.tokens, reads);
    if (placeholder.end === undefined) return reads;
    position = placeholder.end;
  }
}

function collectReads(tokens: readonly Token[], reads: string[]): void {
  tokens.forEach((token, index) => {
    if (token.kind !== "name" || token.value !== "palette") return;
    const before = tokens[index - 1];
    if (before?.kind === "operator" && before.value === ".") return;
    const next = tokens[index + 1];
    const key = tokens[index + 2];
    if (next?.kind !== "operator" || key === undefined) return;
    if (next.value === "." && key.kind === "name") reads.push(key.value);
    else if (next.value === "[" && key.kind === "string" && key.value !== undefined) {
      const close = tokens[index + 3];
      if (close?.kind === "operator" && close.value === "]") reads.push(key.value);
    }
  });
}

/** The tokens after a `{{` at `start`, and the offset after its `}}` (undefined when the text ends first). */
function scanPlaceholder(
  text: string,
  start: number,
): { tokens: Token[]; end: number | undefined } {
  const tokens: Token[] = [];
  let index = start;
  while (index < text.length) {
    const unit = text.charCodeAt(index);
    if (unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d) {
      index++;
    } else if (unit === 0x7d && text.charCodeAt(index + 1) === 0x7d) {
      return { tokens, end: index + 2 };
    } else if (isDigit(unit)) {
      index = skipNumber(text, index);
      tokens.push({ kind: "number" });
    } else if (unit === 0x22 || unit === 0x27) {
      const literal = scanString(text, index);
      if (literal === undefined) return { tokens, end: undefined };
      tokens.push({ kind: "string", value: literal.value });
      index = literal.end;
    } else if (isNameStart(unit)) {
      const end = scanName(text, index);
      tokens.push({ kind: "name", value: text.slice(index, end) });
      index = end;
    } else {
      tokens.push({ kind: "operator", value: text.charAt(index) });
      index++;
    }
  }
  return { tokens, end: undefined };
}

function scanString(
  text: string,
  start: number,
): { value: string | undefined; end: number } | undefined {
  const quote = text.charCodeAt(start);
  let escaped = false;
  for (let index = start + 1; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit === quote) {
      return { value: escaped ? undefined : text.slice(start + 1, index), end: index + 1 };
    }
    if (unit === 0x5c) {
      escaped = true;
      index++;
    }
  }
  return undefined;
}

function skipNumber(text: string, start: number): number {
  let index = skipDigits(text, start);
  if (text.charCodeAt(index) === 0x2e && isDigit(text.charCodeAt(index + 1))) {
    index = skipDigits(text, index + 1);
  }
  const marker = text.charCodeAt(index);
  if (marker === 0x65 || marker === 0x45) {
    const sign = text.charCodeAt(index + 1);
    const digitsAt = sign === 0x2b || sign === 0x2d ? index + 2 : index + 1;
    if (isDigit(text.charCodeAt(digitsAt))) index = skipDigits(text, digitsAt);
  }
  return index;
}

function skipDigits(text: string, start: number): number {
  let index = start;
  while (isDigit(text.charCodeAt(index))) index++;
  return index;
}

function isDigit(unit: number): boolean {
  return unit >= 0x30 && unit <= 0x39;
}

function isNameStart(unit: number): boolean {
  return (unit >= 0x41 && unit <= 0x5a) || (unit >= 0x61 && unit <= 0x7a) || unit === 0x5f;
}

/** `-` joins a name only before a letter or `_`, as in the expression language: `bg-dark` is one name. */
function scanName(text: string, start: number): number {
  let index = start + 1;
  for (;;) {
    const unit = text.charCodeAt(index);
    if (isNameStart(unit) || isDigit(unit)) index++;
    else if (unit === 0x2d && isNameStart(text.charCodeAt(index + 1))) index += 2;
    else return index;
  }
}
