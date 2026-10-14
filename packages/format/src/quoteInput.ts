import { DesignLimits } from "./DesignLimits.js";

const invisible = /[\u007f-\u009f\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu;

/**
 * An input value as it may appear in an issue message: at most `maxEcho` characters, quoted and
 * escaped so control, bidi or line-separator characters cannot reach a log raw.
 */
export function quoteInput(value: string): string {
  const head = Array.from(value.slice(0, DesignLimits.maxEcho * 2));
  const clipped =
    head.length > DesignLimits.maxEcho || value.length > DesignLimits.maxEcho * 2
      ? `${head.slice(0, DesignLimits.maxEcho - 1).join("")}\u2026`
      : head.join("");
  return JSON.stringify(clipped).replace(
    invisible,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
