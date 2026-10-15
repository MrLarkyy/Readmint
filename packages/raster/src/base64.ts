const chunk = 0x8000;
const padded = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** Standard padded base64 of `bytes`, built in chunks so a large font does not overflow the argument list. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}

/** The bytes of standard padded base64, or undefined for anything else (no whitespace, no URL alphabet, no cut-off). */
export function decodeBase64(text: string): Uint8Array | undefined {
  if (!padded.test(text)) return undefined;
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
