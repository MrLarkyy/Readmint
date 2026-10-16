/** Where a top-level section's value lies in the settings text, and the indent of the line its key stands on. */
export interface SectionSpan {
  /** Offset of the value's first character. */
  readonly start: number;
  /** Offset after the value's last character. */
  readonly end: number;
  readonly indent: string;
}

/**
 * The value spans of the top-level members of settings text that already parsed as a JSON object, found in one
 * linear scan (strings and their escapes are skipped, so braces and quotes inside a value cannot confuse it).
 */
export function sectionSpans(source: string): ReadonlyMap<string, SectionSpan> {
  const spans = new Map<string, SectionSpan>();
  let at = source.startsWith("﻿") ? 1 : 0;
  at = skipSpace(source, at);
  if (source[at] !== "{") return spans;
  at += 1;
  for (;;) {
    at = skipSpace(source, at);
    if (source[at] !== '"') return spans;
    const keyStart = at;
    at = endOfString(source, at);
    const key = JSON.parse(source.slice(keyStart, at)) as string;
    at = skipSpace(source, at) + 1;
    at = skipSpace(source, at);
    const start = at;
    at = endOfValue(source, at);
    spans.set(key, { start, end: at, indent: indentOf(source, keyStart) });
    at = skipSpace(source, at);
    if (source[at] !== ",") return spans;
    at += 1;
  }
}

function skipSpace(source: string, from: number): number {
  let at = from;
  while (at < source.length && " \t\r\n".includes(source[at] as string)) at += 1;
  return at;
}

/** The offset after the string that starts at `from` (on its opening quote). */
function endOfString(source: string, from: number): number {
  let at = from + 1;
  while (at < source.length) {
    const char = source[at];
    if (char === "\\") at += 2;
    else if (char === '"') return at + 1;
    else at += 1;
  }
  return source.length;
}

function endOfValue(source: string, from: number): number {
  const first = source[from];
  if (first === '"') return endOfString(source, from);
  if (first !== "{" && first !== "[") {
    let at = from;
    while (at < source.length && !",}] \t\r\n".includes(source[at] as string)) at += 1;
    return at;
  }
  let depth = 0;
  let at = from;
  while (at < source.length) {
    const char = source[at];
    if (char === '"') {
      at = endOfString(source, at);
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
    at += 1;
  }
  return source.length;
}

function indentOf(source: string, offset: number): string {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  let end = lineStart;
  while (end < offset && " \t".includes(source[end] as string)) end += 1;
  return source.slice(lineStart, end);
}
