import { windowsDeviceName } from "@readmint/format";
import type { AssetPathErrorCode } from "./AssetPathError.js";

const maxLength = 1024;

const forbiddenCharacters = new Set(["\\", ":", "*", "?", '"', "<", ">", "|"]);

/** The first rule an asset source breaks, with the device it names for device-name. */
export interface AssetPathIssue {
  readonly code: AssetPathErrorCode;
  readonly device?: string;
}

/**
 * Lexical rules for a relative asset source, the same on every platform so a design refused on
 * Windows is refused on Linux too. The filesystem checks follow in `resolveAsset`.
 */
export function checkAssetPath(src: string): AssetPathErrorCode | undefined {
  return findAssetPathIssue(src)?.code;
}

export function findAssetPathIssue(src: string): AssetPathIssue | undefined {
  if (src === "") return { code: "empty" };
  if (src.length > maxLength) return { code: "too-long" };
  if (/^[/\\]/.test(src) || /^[A-Za-z]:/.test(src)) return { code: "absolute" };
  if (hasInvalidCharacter(src)) return { code: "invalid-character" };
  const segments = src.split("/");
  if (segments.includes("..")) return { code: "parent-segment" };
  // Windows strips a trailing dot or space from a segment, so "a./b" opens "a/b" and ".. " opens "..".
  if (segments.some((segment) => segment !== "." && /[. ]$/.test(segment))) {
    return { code: "trailing-dot-or-space" };
  }
  for (const segment of segments) {
    const device = windowsDeviceName(segment);
    if (device !== undefined) return { code: "device-name", device };
  }
  return undefined;
}

function hasInvalidCharacter(src: string): boolean {
  // \p{Cs} with the u flag matches only unpaired surrogates (ill-formed UTF-16).
  if (/\p{Cs}/u.test(src)) return true;
  for (const char of src) {
    const unit = char.charCodeAt(0);
    if (unit < 0x20 || unit === 0x7f || forbiddenCharacters.has(char)) return true;
  }
  return false;
}
