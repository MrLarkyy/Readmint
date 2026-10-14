import { isLogUnsafe } from "./isLogUnsafe.js";

/**
 * Text as the CLI prints it: every `isLogUnsafe` code point written as `\uXXXX` escapes (one per
 * UTF-16 unit), so data or a design cannot spoof a terminal or log line. No quoting, no clipping.
 */
export function escapeForLog(text: string): string {
  let escaped = "";
  for (const codePoint of text) {
    if (!isLogUnsafe(codePoint)) {
      escaped += codePoint;
      continue;
    }
    for (let i = 0; i < codePoint.length; i++) {
      escaped += `\\u${codePoint.charCodeAt(i).toString(16).padStart(4, "0")}`;
    }
  }
  return escaped;
}
