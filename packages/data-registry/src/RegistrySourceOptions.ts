import type { DataSourceLoadMeta, DataSourceLoadOptions } from "@readmint/data";

/** Ranges and defaults of the load options, and the fixed caps applied to every answer. */
export const RegistryLimits = Object.freeze({
  /** Entries per list (npm and Maven each). */
  maxEntries: 20,
  minMaxBytes: 1,
  maxMaxBytes: 4 * 1024 * 1024,
  defaultMaxBytes: 1024 * 1024,
  minTimeoutMs: 1000,
  maxTimeoutMs: 120_000,
  defaultTimeoutMs: 30_000,
  minCacheTtlSeconds: 1,
  maxCacheTtlSeconds: 604_800,
  defaultCacheTtlSeconds: 3600,
  /** Characters of a version, the longest an answer may carry. */
  versionLength: 64,
  /** Longest `Retry-After` of a 429 the load waits for, once; a longer one fails `rate-limited`. */
  maxRetryWaitSeconds: 10,
  /** Wait before the one retry of a 500, 502, 503 or 504. */
  serverRetryDelayMs: 1000,
});

export type RegistryLimits = typeof RegistryLimits;

/** `fetch` as the loader calls it; injectable so tests answer without a network. */
export type RegistryFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface RegistrySourceOptions extends DataSourceLoadOptions {
  /** Root name in expressions (default `registry`); see `isDataNamespace`. */
  readonly namespace?: string;
  /** npm package names (`react`, `@types/node`), at most 20, no duplicate. */
  readonly npm?: readonly string[];
  /** Maven coordinates as `group:artifact`, at most 20, no duplicate. At least one entry overall. */
  readonly maven?: readonly string[];
  readonly fetch?: RegistryFetch;
  /** Waits before a retry; injectable so tests do not wait. It may ignore the signal. */
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Size of one answer in bytes, 1 to 4 MiB (default 1 MiB). */
  readonly maxBytes?: number;
  /** Whole load, every request, retry and wait included, 1000 to 120000 ms (default 30000). */
  readonly timeoutMs?: number;
  /** Lifetime of a cache entry, 1 to 604800 s (default 3600). */
  readonly cacheTtlSeconds?: number;
}

/** `meta` of a registry load. */
export interface RegistryLoadMeta extends DataSourceLoadMeta {
  /** Entries a registry does not know, as `npm:<name>` or `maven:<group>:<artifact>`, in the order asked for. */
  readonly missing: readonly string[];
}
