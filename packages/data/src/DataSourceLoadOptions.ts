import type { DataSourceCache } from "./DataSourceCache.js";

/** Options every source accepts; a source adds its own (a token, a login) on top. */
export interface DataSourceLoadOptions {
  readonly signal?: AbortSignal;
  readonly cache?: DataSourceCache;
  /** Lifetime of a cache entry in seconds. */
  readonly cacheTtlSeconds?: number;
}
