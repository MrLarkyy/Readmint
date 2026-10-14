// Controls, format characters (bidi marks, zero-width), line/paragraph separators, private-use,
// unassigned and surrogate code points: none may reach a log line raw.
const unsafe = /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}]$/u;

/**
 * Whether one code point (one or two UTF-16 units) is written escaped wherever the CLI prints.
 * Wider than format's `isInvisible`: Node only, so it may follow the engine's Unicode version.
 */
export function isLogUnsafe(codePoint: string): boolean {
  return unsafe.test(codePoint);
}
