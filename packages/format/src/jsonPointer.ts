import { DesignLimits } from "./DesignLimits.js";

/**
 * Pointer of `key` below `parent` (RFC 6901: `~` -> `~0`, `/` -> `~1`).
 * A key longer than the echo limit or holding control or bidi characters is never put into a
 * path, because paths reach logs unescaped; such issues are reported at the parent instead.
 */
export function jsonPointer(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}/${String(key)}`;
  if (!isPathSafeKey(key)) return parent;
  return `${parent}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

export function isPathSafeKey(key: string): boolean {
  if (key.length > DesignLimits.maxEcho) return false;
  for (let index = 0; index < key.length; index++)
    if (isInvisible(key.charCodeAt(index))) return false;
  return true;
}

/** Control, bidi-override and line-separator characters. */
function isInvisible(unit: number): boolean {
  return (
    unit < 0x20 ||
    (unit >= 0x7f && unit <= 0x9f) ||
    unit === 0x200e ||
    unit === 0x200f ||
    unit === 0x2028 ||
    unit === 0x2029 ||
    (unit >= 0x202a && unit <= 0x202e) ||
    (unit >= 0x2066 && unit <= 0x2069)
  );
}
