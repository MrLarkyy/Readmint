const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const values = new Int16Array(128).fill(-1);
for (let index = 0; index < alphabet.length; index++) values[alphabet.charCodeAt(index)] = index;

/** Standard base64 with padding; no platform API, so Node and browsers produce the same text. */
export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    chunk +=
      alphabet.charAt(triple >> 18) +
      alphabet.charAt((triple >> 12) & 63) +
      (index + 1 < bytes.length ? alphabet.charAt((triple >> 6) & 63) : "=") +
      (index + 2 < bytes.length ? alphabet.charAt(triple & 63) : "=");
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

/** Decoded size of a padded base64 text, or undefined when its length cannot be base64. */
export function decodedBase64Length(text: string): number | undefined {
  if (text.length % 4 !== 0) return undefined;
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  return (text.length / 4) * 3 - padding;
}

/** Strict decoding: only the standard alphabet with correct padding; anything else gives undefined. */
export function decodeBase64(text: string): Uint8Array | undefined {
  const length = decodedBase64Length(text);
  if (length === undefined) return undefined;
  const bytes = new Uint8Array(length);
  const padding = (text.length / 4) * 3 - length;
  const full = text.length - (padding === 0 ? 0 : 4);
  let out = 0;
  for (let index = 0; index < full; index += 4) {
    const triple = quad(text, index, 4);
    if (triple < 0) return undefined;
    bytes[out++] = triple >> 16;
    bytes[out++] = (triple >> 8) & 255;
    bytes[out++] = triple & 255;
  }
  if (padding === 0) return bytes;
  const triple = quad(text, full, 4 - padding);
  if (triple < 0) return undefined;
  bytes[out++] = triple >> 16;
  if (padding === 1) bytes[out] = (triple >> 8) & 255;
  return bytes;
}

/** The 24 bits of `count` digits at `index` (missing digits are 0), or -1 on a character outside the alphabet. */
function quad(text: string, index: number, count: number): number {
  let triple = 0;
  for (let offset = 0; offset < 4; offset++) {
    let digit = 0;
    if (offset < count) {
      const code = text.charCodeAt(index + offset);
      digit = code < 128 ? (values[code] ?? -1) : -1;
      if (digit < 0) return -1;
    }
    triple = (triple << 6) | digit;
  }
  return triple;
}
