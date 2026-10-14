import { sha256Hex } from "./sha256Hex.js";

/**
 * Cache key covering the namespace, the data version and every input field. Inputs must never
 * hold a secret: the key is a digest, but a cache can be shared and listed.
 */
export function dataSourceCacheKey(
  source: { readonly namespace: string; readonly dataVersion: number },
  input: Readonly<Record<string, string | number | boolean | null>>,
): Promise<string> {
  return sha256Hex(
    JSON.stringify({ namespace: source.namespace, dataVersion: source.dataVersion, input }),
  );
}
