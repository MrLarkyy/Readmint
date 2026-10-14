import { DesignLimits } from "./DesignLimits.js";
import { isInvisible } from "./isInvisible.js";

/**
 * Pointer of `key` below `parent` (RFC 6901: `~` -> `~0`, `/` -> `~1`).
 * A key longer than the echo limit or holding an invisible character (`isInvisible`) is never put
 * into a path, because paths reach logs unescaped; such issues are reported at the parent instead.
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
