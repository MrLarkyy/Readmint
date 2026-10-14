import type { AssetPathErrorCode } from "./AssetPathError.js";

const maxLength = 1024;

// Windows opens these as devices in any folder and with any extension ("CON.png", "com1.txt").
// Superscript digits count too: Windows maps them to 1-3 for COM and LPT.
const devices = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "CONIN$",
  "CONOUT$",
  ...["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "\u00b9", "\u00b2", "\u00b3"].flatMap(
    (digit) => [`COM${digit}`, `LPT${digit}`],
  ),
]);

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
    const device = deviceName(segment);
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

function deviceName(segment: string): string | undefined {
  const dot = segment.indexOf(".");
  const stem = (dot === -1 ? segment : segment.slice(0, dot)).replace(/ +$/, "").toUpperCase();
  return devices.has(stem) ? stem : undefined;
}
