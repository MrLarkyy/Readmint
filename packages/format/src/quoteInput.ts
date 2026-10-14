import { DesignLimits } from "./DesignLimits.js";
import { isInvisible } from "./isInvisible.js";

export interface QuoteOptions {
  /** Code points echoed before the value is clipped with an ellipsis; default `DesignLimits.maxEcho`. */
  readonly maxEcho?: number;
  /**
   * Whether a code point (one or two UTF-16 units) is written as `\uXXXX` escapes, one per unit; default: a single
   * unit that `isInvisible` flags.
   */
  readonly escape?: (codePoint: string) => boolean;
}

const escapeInvisible = (codePoint: string): boolean =>
  codePoint.length === 1 && isInvisible(codePoint.charCodeAt(0));

/**
 * An input value as it may appear in an issue message: at most `maxEcho` code points, quoted and
 * escaped so no invisible character reaches a log raw.
 */
export function quoteInput(value: string, options: QuoteOptions = {}): string {
  const maxEcho = options.maxEcho ?? DesignLimits.maxEcho;
  const escape = options.escape ?? escapeInvisible;
  const head = Array.from(value.slice(0, maxEcho * 2));
  const clipped =
    head.length > maxEcho || value.length > maxEcho * 2
      ? `${head.slice(0, maxEcho - 1).join("")}\u2026`
      : head.join("");
  // JSON.stringify escapes quotes, backslashes, C0 controls and lone surrogates; the rest follow here.
  let quoted = "";
  for (const codePoint of JSON.stringify(clipped)) {
    quoted += escape(codePoint) ? escapeUnits(codePoint) : codePoint;
  }
  return quoted;
}

function escapeUnits(codePoint: string): string {
  let escaped = "";
  for (let i = 0; i < codePoint.length; i++) {
    escaped += `\\u${codePoint.charCodeAt(i).toString(16).padStart(4, "0")}`;
  }
  return escaped;
}
