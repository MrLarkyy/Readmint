import { DesignLimits } from "./DesignLimits.js";
import { isInvisible } from "./isInvisible.js";

/**
 * An input value as it may appear in an issue message: at most `maxEcho` characters, quoted and
 * escaped so no invisible character (`isInvisible`) reaches a log raw.
 */
export function quoteInput(value: string): string {
  const head = Array.from(value.slice(0, DesignLimits.maxEcho * 2));
  const clipped =
    head.length > DesignLimits.maxEcho || value.length > DesignLimits.maxEcho * 2
      ? `${head.slice(0, DesignLimits.maxEcho - 1).join("")}\u2026`
      : head.join("");
  // JSON.stringify escapes quotes, backslashes and C0 controls; the other invisibles follow here.
  let quoted = "";
  for (const char of JSON.stringify(clipped)) {
    const unit = char.charCodeAt(0);
    quoted +=
      char.length === 1 && isInvisible(unit) ? `\\u${unit.toString(16).padStart(4, "0")}` : char;
  }
  return quoted;
}
