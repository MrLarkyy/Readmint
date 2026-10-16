import { JsonLimits } from "./JsonSourceOptions.js";

// Windows opens these names as devices in any directory, whatever the extension.
const DEVICE_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$/i;

/**
 * Why a file source cannot name a file inside the host's root, or `undefined` when it can: it must
 * be relative and `/`- or `\`-separated, without `..` segments, control characters, a colon
 * (drive letters and NTFS streams) or a Windows device name. A leading slash or backslash covers
 * absolute, UNC and device paths. Links are resolved and checked by the file reader.
 */
export function checkRelativeSource(text: string): string | undefined {
  if (text === "") return "is empty";
  if (text.length > JsonLimits.maxSourceLength) {
    return `is longer than ${String(JsonLimits.maxSourceLength)} characters`;
  }
  // eslint-disable-next-line no-control-regex -- control characters are what is refused here
  if (/[\u0000-\u001f\u007f]/.test(text)) return "contains a control character";
  if (/^[\\/]/.test(text) || /^[A-Za-z]:/.test(text)) return "is not a relative path";
  if (text.includes(":")) return "contains a colon";
  const segments = text.split(/[\\/]/);
  if (segments.some((segment) => segment === "..")) return "leaves the root (..)";
  if (segments.some((segment) => DEVICE_NAME.test(segment.trimEnd()))) {
    return "names a device";
  }
  return undefined;
}
