const maxEcho = 200;

// Controls, format characters (bidi marks, zero-width), line/paragraph separators, private-use,
// unassigned and surrogate code points: none may reach a log line raw.
const invisible = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]$/u;

/**
 * An asset source as it may appear in an error message: at most `maxEcho` code points, quoted
 * and escaped so no invisible or bidi character spoofs the log line.
 */
export function quoteAssetSource(src: string): string {
  const head = Array.from(src.slice(0, maxEcho * 2));
  const clipped =
    head.length > maxEcho || src.length > maxEcho * 2
      ? `${head.slice(0, maxEcho - 1).join("")}\u2026`
      : head.join("");
  let quoted = "";
  for (const char of JSON.stringify(clipped)) {
    quoted += invisible.test(char) ? escapeUnits(char) : char;
  }
  return quoted;
}

function escapeUnits(char: string): string {
  let escaped = "";
  for (let i = 0; i < char.length; i++) {
    escaped += `\\u${char.charCodeAt(i).toString(16).padStart(4, "0")}`;
  }
  return escaped;
}
