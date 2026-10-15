const chunk = 0x8000;

/** Standard base64 of `bytes`, built in chunks so a large font does not overflow the argument list. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunk));
  }
  return btoa(binary);
}

/** The bytes of a base64 `data:` URI, or undefined when it is not one. */
export function decodeDataUri(uri: string): Uint8Array | undefined {
  const match = /^data:[^,;]*;base64,([A-Za-z0-9+/]*={0,2})$/u.exec(uri);
  if (match?.[1] === undefined) return undefined;
  try {
    return Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}
