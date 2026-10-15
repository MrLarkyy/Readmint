/** Length and 32-bit FNV-1a of `bytes`: equal bytes give equal keys (a key match is confirmed by `sameBytes`). */
export function bytesKey(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${String(bytes.length)}-${(hash >>> 0).toString(36)}`;
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
