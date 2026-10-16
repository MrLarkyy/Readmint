import type { DataSourceLoadOptions } from "@readmint/data";

/** Ranges and defaults of the load options, and the fixed caps applied to every response. */
export const GitHubLimits = Object.freeze({
  minPageSize: 1,
  maxPageSize: 100,
  defaultPageSize: 100,
  minRepositories: 1,
  maxRepositories: 1000,
  defaultMaxRepositories: 300,
  minRequestTimeoutMs: 1000,
  maxRequestTimeoutMs: 120_000,
  defaultRequestTimeoutMs: 30_000,
  minRetryWaitSeconds: 0,
  maxRetryWaitSeconds: 900,
  defaultMaxRetryWaitSeconds: 60,
  minCacheTtlSeconds: 1,
  maxCacheTtlSeconds: 604_800,
  defaultCacheTtlSeconds: 3600,
  /** Entries of `excludeRepositories`. */
  maxExcludedRepositories: 100,
  /** Attempts per request while GitHub answers with a secondary rate limit. */
  maxAttempts: 3,
  /** Wait for a secondary rate limit that names no `retry-after`. */
  defaultSecondaryWaitSeconds: 60,
  /** Wait before the single retry of a 502, 503 or 504. */
  serverErrorRetryDelayMs: 1000,
  /** Response body size, checked before and while reading. */
  maxBodyBytes: 8 * 1024 * 1024,
  /** UTF-16 code units of any string taken from a response. */
  maxStringLength: 1024,
  /** Languages loaded per repository (GitHub's page maximum; the rest are not counted). */
  maxLanguagesPerRepository: 100,
  maxCalendarWeeks: 54,
  /** Repositories shown as pinned. */
  maxPinned: 6,
  /** Pushes returned. */
  maxPushes: 10,
  /** Repositories GitHub reports recent commits for. */
  maxPushRepositories: 10,
  maxCommitsPerRepository: 10,
  /** Weeks of `weeklyCommits`. */
  weeklyCommitWeeks: 52,
  /** Days of `pushes`, the last one included. */
  recentDays: 7,
});

export type GitHubLimits = typeof GitHubLimits;

/** `fetch` as the loader calls it; injectable so tests replay recorded responses. */
export type GitHubFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubSourceOptions extends DataSourceLoadOptions {
  /** The user's GitHub token. It is only ever sent in the `Authorization` header. */
  readonly token: string;
  /** GitHub login to load; the token's owner (`viewer`) when absent. */
  readonly login?: string;
  /** Repositories per request, 1 to 100 (default 100). */
  readonly pageSize?: number;
  /** Repositories loaded at most, 1 to 1000 (default 300). */
  readonly maxRepositories?: number;
  /**
   * Repositories left out of every aggregate, as `name` or `owner/name` (case-insensitive), at
   * most 100. Explicit profile pins are not affected.
   */
  readonly excludeRepositories?: readonly string[];
  /** Per request, 1000 to 120000 ms (default 30000). */
  readonly requestTimeoutMs?: number;
  /** Longest secondary rate-limit wait accepted, 0 to 900 s (default 60). */
  readonly maxRetryWaitSeconds?: number;
  /** Lifetime of a cache entry, 1 to 604800 s (default 3600). */
  readonly cacheTtlSeconds?: number;
  readonly fetch?: GitHubFetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}
