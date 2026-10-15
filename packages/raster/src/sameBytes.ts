/** Whether two byte arrays hold the same bytes. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) {
    if (a[at] !== b[at]) return false;
  }
  return true;
}
