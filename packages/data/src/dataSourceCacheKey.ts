import { sha256Hex } from "./sha256Hex.js";

/**
 * Cache key covering the namespace, the data version and every input field. Inputs must never
 * hold a secret: the key is a digest, but a cache can be shared and listed. A non-finite number
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
