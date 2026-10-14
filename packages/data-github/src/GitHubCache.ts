/**
 * Storage for validated GitHub responses. Keys are SHA-256 hex digests that never cover the
 * token; values are JSON text. A miss, an expired entry or an unreadable entry is `undefined`.
 */
export interface GitHubCache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}
