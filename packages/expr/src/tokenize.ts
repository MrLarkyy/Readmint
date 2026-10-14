import { failWith, type ErrorSite } from "./createError.js";
import type { ExprResult } from "./ExprResult.js";
import { isDigit, isNameStart, scanName } from "./nameSyntax.js";
import type { Operator, Token } from "./Token.js";

export interface Placeholder {
  readonly tokens: readonly Token[];
  /** Offset just after the closing `}}`. */
  readonly end: number;
}

const twoCharOperators: ReadonlySet<string> = new Set(["==", "!=", "<=", ">=", "&&", "||"]);
const oneCharOperators: ReadonlySet<string> = new Set("()[],.|?:+-*/%!<>");

/**
 * Scans one placeholder of `source` starting after its `{{` (offset `start`) up to and including
 * the closing `}}`; a `}}` inside a string literal does not close it. A linear scan without regular
 * expressions, so no input can make it backtrack.
 */
export function tokenize(source: string, start: number): ExprResult<Placeholder> {
  const site: ErrorSite = { source, segment: { start: start - 2, end: source.length } };
  const tokens: Token[] = [];
  let index = start;
  while (index < source.length) {
    const unit = source.charCodeAt(index);
    if (unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d) {
      index++;
    } else if (unit === 0x7d && source.charCodeAt(index + 1) === 0x7d) {
      tokens.push({ kind: "close", value: "}}", start: index, end: index + 2 });
      return { ok: true, value: { tokens, end: index + 2 } };
    } else if (isDigit(unit)) {
      const scanned = scanNumber(source, index, site);
      if (!scanned.ok) return scanned;
      tokens.push(scanned.value);
      index = scanned.value.end;
    } else if (unit === 0x22 || unit === 0x27) {
      const scanned = scanString(source, index, site);
      if (!scanned.ok) return scanned;
      tokens.push(scanned.value);
      index = scanned.value.end;
    } else if (isNameStart(unit)) {
      const end = scanName(source, index);
      tokens.push({ kind: "name", value: source.slice(index, end), start: index, end });
      index = end;
    } else {
      const pair = source.slice(index, index + 2);
      const operator = twoCharOperators.has(pair) ? pair : source.charAt(index);
      if (!twoCharOperators.has(operator) && !oneCharOperators.has(operator)) {
        const span = { start: index, end: index + 1 };
        const hint = operator === "=" ? " (compare with ==)" : "";
        return failWith(site, "syntax", `unexpected character${hint}`, span);
      }
      tokens.push({
        kind: "operator",
        value: operator as Operator,
        start: index,
        end: index + operator.length,
      });
      index += operator.length;
    }
  }
  return failWith(site, "syntax", "unclosed {{ (expected }})", { start: start - 2, end: start });
}

function scanNumber(source: string, start: number, site: ErrorSite): ExprResult<Token> {
  let index = skipDigits(source, start);
  if (source.charCodeAt(index) === 0x2e && isDigit(source.charCodeAt(index + 1))) {
    index = skipDigits(source, index + 1);
  }
  const marker = source.charCodeAt(index);
  if (marker === 0x65 || marker === 0x45) {
    const sign = source.charCodeAt(index + 1);
    const digitsAt = sign === 0x2b || sign === 0x2d ? index + 2 : index + 1;
    if (isDigit(source.charCodeAt(digitsAt))) index = skipDigits(source, digitsAt);
  }
  const span = { start, end: index };
  if (isNameStart(source.charCodeAt(index)) || isDigit(source.charCodeAt(index))) {
    return failWith(site, "syntax", "unexpected character after a number", {
      start: index,
      end: index + 1,
    });
  }
  const value = Number(source.slice(start, index));
  if (!Number.isFinite(value)) return failWith(site, "not-finite", "number is out of range", span);
  return { ok: true, value: { kind: "number", value, ...span } };
}

function scanString(source: string, start: number, site: ErrorSite): ExprResult<Token> {
  const quote = source.charCodeAt(start);
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    const unit = source.charCodeAt(index);
    if (unit === quote) {
      return { ok: true, value: { kind: "string", value, start, end: index + 1 } };
    }
    if (unit !== 0x5c) {
      value += source.charAt(index);
      index++;
      continue;
    }
    const escape = source.charAt(index + 1);
    const simple = simpleEscapes.get(escape);
    if (simple !== undefined) {
      value += simple;
      index += 2;
    } else if (escape === "u" && source.charAt(index + 2) === "{") {
      const close = source.indexOf("}", index + 3);
      const hex = close === -1 ? "" : source.slice(index + 3, close);
      const codePoint = parseHex(hex);
      if (codePoint === undefined) {
        return failWith(
          site,
          "syntax",
          "invalid \\u{...} escape (1 to 6 hex digits, no surrogate)",
          {
            start: index,
            end: index + 2,
          },
        );
      }
      value += String.fromCodePoint(codePoint);
      index = close + 1;
    } else {
      return failWith(site, "syntax", "unknown escape (use \\\\ \\' \\\" \\n \\t or \\u{...})", {
        start: index,
        end: Math.min(index + 2, source.length),
      });
    }
  }
  return failWith(site, "syntax", "unterminated string", { start, end: source.length });
}

const simpleEscapes: ReadonlyMap<string, string> = new Map([
  ["\\", "\\"],
  ["'", "'"],
  ['"', '"'],
  ["n", "\n"],
  ["t", "\t"],
]);

function parseHex(hex: string): number | undefined {
  if (hex.length === 0 || hex.length > 6) return undefined;
  let value = 0;
  for (let index = 0; index < hex.length; index++) {
    const digit = hexDigit(hex.charCodeAt(index));
    if (digit === undefined) return undefined;
    value = value * 16 + digit;
  }
  if (value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return undefined;
  return value;
}

function hexDigit(unit: number): number | undefined {
  if (isDigit(unit)) return unit - 0x30;
  if (unit >= 0x61 && unit <= 0x66) return unit - 0x61 + 10;
  if (unit >= 0x41 && unit <= 0x46) return unit - 0x41 + 10;
  return undefined;
}

function skipDigits(source: string, start: number): number {
  let index = start;
  while (isDigit(source.charCodeAt(index))) index++;
  return index;
}
