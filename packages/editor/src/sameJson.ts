/** Whether two JSON-like values serialise alike (same keys in the same order, same values). */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
