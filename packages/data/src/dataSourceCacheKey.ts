import { sha256Hex } from "./sha256Hex.js";

/**
 * Cache key covering the namespace, the data version and every input field. The key is a one-way
 * SHA-256 digest: an input may be a URL that holds a secret query value, and neither the URL nor
 * the secret is in the key or in a FileCache file name. A secret inside an input, including a URL
 * query value, must be high-entropy: the rest of the URL is public, so a short one (`?pin=1234`)
 * can be guessed against the digest by anyone who can list the cache. The key does not protect
 * the stored value: a cached body is as sensitive as the URL it came from. A non-finite number
 * throws: JSON would write it as null and different inputs would share a key.
 */
export function dataSourceCacheKey(
  source: { readonly namespace: string; readonly dataVersion: number },
  input: Readonly<Record<string, string | number | boolean | null>>,
): Promise<string> {
  for (const [field, value] of Object.entries(input)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return Promise.reject(new TypeError(`cache key input ${field} must be a finite number`));
    }
  }
  return sha256Hex(
    JSON.stringify({ namespace: source.namespace, dataVersion: source.dataVersion, input }),
  );
}
