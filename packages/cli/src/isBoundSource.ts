/** Whether an asset `src` is a `{{binding}}` (only image sources may be one), not a path or a data URI. */
export function isBoundSource(src: string): boolean {
  return src.length >= 4 && src.startsWith("{{") && src.endsWith("}}");
}
