/**
 * A valid asset id from a file name without its extension: letters, digits, `_` and `-`, starting with a letter;
 * `fallback` when the name keeps none of them.
 */
export function assetIdBase(stem: string, fallback: string): string {
  const cleaned = stem.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^[^A-Za-z]+/u, "");
  return (cleaned === "" ? fallback : cleaned).slice(0, 56);
}
