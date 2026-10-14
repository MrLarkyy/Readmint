import { DesignLimits } from "./DesignLimits.js";
import type { IssueCollector } from "./IssueCollector.js";
import type { LineIndex } from "./LineIndex.js";
import { quoteInput } from "./quoteInput.js";

type Mode = "value" | "valueOrEnd" | "keyOrEnd" | "key" | "colon" | "commaOrEnd" | "end";

interface Container {
  readonly keys: Set<string> | undefined;
}

/**
 * Strict RFC 8259 syntax check in one iterative pass, run before `JSON.parse`: it locates the
 * first syntax error (engines differ in whether their message has a position), reports duplicate
 * keys (`JSON.parse` silently keeps the last) and stops nesting beyond `maxDepth`.
 * Returns true when the source may be handed to `JSON.parse`.
 */
export function scanJson(source: string, lines: LineIndex, issues: IssueCollector): boolean {
  const stack: Container[] = [];
  let pos = 0;
  let mode: Mode = "value";
  const fail = (code: "parse" | "too-deep", message: string): false => {
    issues.add({ path: "", code, message, ...lines.at(pos) });
    return false;
  };
  const afterValue = (): Mode => (stack.length === 0 ? "end" : "commaOrEnd");

  for (;;) {
    while (pos < source.length && isWhitespace(source.charCodeAt(pos))) pos++;
    if (pos >= source.length)
      return mode === "end" ? true : fail("parse", "invalid JSON: unexpected end of input");
    const char = source[pos] ?? "";
    switch (mode) {
      case "value": {
        if (char === "{" || char === "[") {
          if (stack.length >= DesignLimits.maxDepth)
            return fail(
              "too-deep",
              `objects and arrays nest deeper than ${String(DesignLimits.maxDepth)} levels`,
            );
          stack.push({ keys: char === "{" ? new Set() : undefined });
          pos++;
          mode = char === "{" ? "keyOrEnd" : "valueOrEnd";
          break;
        }
        const end = scanScalar(source, pos);
        if (end === undefined) return fail("parse", unexpected(char));
        if (end < 0) {
          pos = -end;
          return fail("parse", unexpected(source[pos]));
        }
        pos = end;
        mode = afterValue();
        break;
      }
      case "valueOrEnd":
      case "keyOrEnd":
        if (char === (mode === "keyOrEnd" ? "}" : "]")) {
          stack.pop();
          pos++;
          mode = afterValue();
        } else mode = mode === "keyOrEnd" ? "key" : "value";
        break;
      case "key": {
        if (char !== '"') return fail("parse", "invalid JSON: expected a double-quoted key");
        const end = scanString(source, pos);
        if (end < 0) {
          pos = -end;
          return fail("parse", unexpected(source[pos]));
        }
        const raw = source.slice(pos, end);
        const key = raw.includes("\\") ? (JSON.parse(raw) as string) : raw.slice(1, -1);
        const keys = stack.at(-1)?.keys;
        if (keys?.has(key))
          issues.add({
            path: "",
            code: "duplicate-key",
            message: `duplicate key ${quoteInput(key)}`,
            ...lines.at(pos),
          });
        keys?.add(key);
        pos = end;
        mode = "colon";
        break;
      }
      case "colon":
        if (char !== ":") return fail("parse", "invalid JSON: expected ':'");
        pos++;
        mode = "value";
        break;
      case "commaOrEnd": {
        const object = stack.at(-1)?.keys !== undefined;
        if (char === ",") {
          pos++;
          mode = object ? "key" : "value";
        } else if (char === (object ? "}" : "]")) {
          stack.pop();
          pos++;
          mode = afterValue();
        } else return fail("parse", unexpected(char));
        break;
      }
      case "end":
        return fail("parse", unexpected(char));
    }
  }
}

function unexpected(char: string | undefined): string {
  return char === undefined
    ? "invalid JSON: unexpected end of input"
    : `invalid JSON: unexpected ${quoteInput(char)}`;
}

function isWhitespace(unit: number): boolean {
  return unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d;
}

/**
 * End offset of the string, number or literal at `pos`; `undefined` when none starts there,
 * a negative offset (`-at`) for an invalid character inside one.
 */
function scanScalar(source: string, pos: number): number | undefined {
  const char = source[pos];
  if (char === '"') return scanString(source, pos);
  for (const literal of ["true", "false", "null"])
    if (source.startsWith(literal, pos)) return pos + literal.length;
  if (char === "-" || isDigit(source.charCodeAt(pos))) return scanNumber(source, pos);
  return undefined;
}

function scanString(source: string, start: number): number {
  let pos = start + 1;
  while (pos < source.length) {
    const unit = source.charCodeAt(pos);
    if (unit === 0x22) return pos + 1;
    if (unit < 0x20) return -pos;
    if (unit === 0x5c) {
      const next = source[pos + 1];
      if (next === "u") {
        if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(pos + 2, pos + 6))) return -(pos + 1);
        pos += 6;
      } else if (next !== undefined && '"\\/bfnrt'.includes(next)) pos += 2;
      else return -(pos + 1);
    } else pos++;
  }
  return -pos;
}

function scanNumber(source: string, start: number): number {
  let pos = start;
  if (source[pos] === "-") pos++;
  if (source[pos] === "0") pos++;
  else if (isDigit(source.charCodeAt(pos)) && source[pos] !== "0") pos = digits(source, pos);
  else return -pos;
  if (source[pos] === ".") {
    if (!isDigit(source.charCodeAt(pos + 1))) return -(pos + 1);
    pos = digits(source, pos + 1);
  }
  if (source[pos] === "e" || source[pos] === "E") {
    pos++;
    if (source[pos] === "+" || source[pos] === "-") pos++;
    if (!isDigit(source.charCodeAt(pos))) return -pos;
    pos = digits(source, pos);
  }
  return pos;
}

function digits(source: string, start: number): number {
  let pos = start;
  while (isDigit(source.charCodeAt(pos))) pos++;
  return pos;
}

function isDigit(unit: number): boolean {
  return unit >= 0x30 && unit <= 0x39;
}
