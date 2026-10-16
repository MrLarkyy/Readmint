import type { DataSourceLoadOptions } from "@readmint/data";

/** Ranges and defaults of the load options, and the fixed caps applied to every feed. */
export const FeedLimits = Object.freeze({
  minMaxBytes: 1,
  maxMaxBytes: 8 * 1024 * 1024,
  defaultMaxBytes: 1024 * 1024,
  minTimeoutMs: 1000,
  maxTimeoutMs: 60_000,
  defaultTimeoutMs: 10_000,
  minCacheTtlSeconds: 1,
  maxCacheTtlSeconds: 604_800,
  defaultCacheTtlSeconds: 3600,
  minLimit: 1,
  maxLimit: 50,
  defaultLimit: 5,
  /** Nesting of elements. */
  maxDepth: 32,
  /** Elements in the document. */
  maxElements: 100_000,
  /** Attributes of one element, namespace declarations included. */
  maxAttributes: 64,
  /** Characters of an element or attribute name. */
  maxNameLength: 256,
  /** Code points of a title, the cut included. */
  titleLength: 200,
  /** Code points of a summary, the cut included. */
  summaryLength: 500,
  /** Characters of a link; a longer one is dropped. */
  linkLength: 2048,
});

export type FeedLimits = typeof FeedLimits;

/** `fetch` as the loader calls it; injectable so tests answer without a network. */
export type FeedFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface FeedSourceOptions extends DataSourceLoadOptions {
  /** The feed's `https://` URL. */
  readonly url: string;
  /** Root name in expressions (default `feed`); see `isDataNamespace`. */
  readonly namespace?: string;
  /** Entries kept after sorting, 1 to 50 (default 5). */
  readonly limit?: number;
  readonly fetch?: FeedFetch;
  /** Document size in bytes, 1 to 8 MiB (default 1 MiB). */
  readonly maxBytes?: number;
  /** Whole load, redirects and body included, 1000 to 60000 ms (default 10000). */
  readonly timeoutMs?: number;
  /** Lifetime of a cache entry, 1 to 604800 s (default 3600). */
  readonly cacheTtlSeconds?: number;
}
