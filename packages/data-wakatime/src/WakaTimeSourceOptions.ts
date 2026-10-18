import type { DataSourceLoadMeta, DataSourceLoadOptions } from "@readmint/data";

/** The ranges of the WakaTime stats API, in the API's own spelling; the first is the default. */
export const WAKATIME_RANGES = Object.freeze([
  "last_7_days",
  "last_30_days",
  "last_6_months",
  "last_year",
  "all_time",
] as const);

export type WakaTimeRange = (typeof WAKATIME_RANGES)[number];

/** Ranges and defaults of the load options, and the fixed caps applied to every answer. */
export const WakaTimeLimits = Object.freeze({
  defaultRange: "last_7_days",
  minMaxBytes: 1,
  maxMaxBytes: 8 * 1024 * 1024,
  defaultMaxBytes: 2 * 1024 * 1024,
  minTimeoutMs: 1000,
  maxTimeoutMs: 60_000,
  defaultTimeoutMs: 15_000,
  minCacheTtlSeconds: 1,
  maxCacheTtlSeconds: 604_800,
  defaultCacheTtlSeconds: 3600,
  /** Languages, editors and operating systems kept each. */
  maxEntries: 20,
  /** Code points of a name, the cut included. */
  nameLength: 100,
  /** Code points of `humanReadableTotal`, the cut included. */
  humanTextLength: 64,
  /** Longest `Retry-After` of a 429 the load waits for, once; a longer one fails `rate-limited`. */
  maxRetryWaitSeconds: 10,
  /** Wait before the one retry of a 500, 502, 503 or 504. */
  serverRetryDelayMs: 1000,
});

export type WakaTimeLimits = typeof WakaTimeLimits;

/** `fetch` as the loader calls it; injectable so tests answer without a network. */
export type WakaTimeFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface WakaTimeSourceOptions extends DataSourceLoadOptions {
  /**
   * The user's WakaTime API key. Sent only to wakatime.com in the `Authorization` header; never in a URL, a cache
   * key, a message or the data. Hosts read it from an environment variable the user names.
   */
  readonly apiKey: string;
  /** Root name in expressions (default `wakatime`); see `isDataNamespace`. */
  readonly namespace?: string;
  /** One of `WAKATIME_RANGES` (default `last_7_days`). */
  readonly range?: string;
  readonly fetch?: WakaTimeFetch;
  /** Waits before a retry; injectable so tests do not wait. It may ignore the signal. */
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  /** Answer size in bytes, 1 to 8 MiB (default 2 MiB). */
  readonly maxBytes?: number;
  /** Whole load, retries and waits included, 1000 to 60000 ms (default 15000). */
  readonly timeoutMs?: number;
  /** Lifetime of a cache entry, 1 to 604800 s (default 3600). */
  readonly cacheTtlSeconds?: number;
}

/** `meta` of a WakaTime load. */
export interface WakaTimeLoadMeta extends DataSourceLoadMeta {
  /** WakaTime was still calculating (HTTP 202 or not up to date): the numbers may grow; such an answer is never cached. */
  readonly partial: boolean;
}
