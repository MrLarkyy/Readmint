import {
  checkHttpsUrl,
  DataSourceError,
  isDataNamespace,
  type DataSourceCache,
} from "@readmint/data";
import { FEED_DATA_DEFAULT_NAMESPACE } from "./FeedData.js";
import { FeedLimits, type FeedFetch, type FeedSourceOptions } from "./FeedSourceOptions.js";

export interface ResolvedFeedOptions {
  readonly namespace: string;
  readonly url: URL;
  readonly limit: number;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly cache: DataSourceCache | null;
  readonly fetch: FeedFetch;
  readonly signal: AbortSignal | null;
}

/** Checks every option before any I/O; an error names the option, never quotes the URL. */
export function resolveFeedOptions(options: FeedSourceOptions): ResolvedFeedOptions {
  const namespace: unknown = options.namespace ?? FEED_DATA_DEFAULT_NAMESPACE;
  if (!isDataNamespace(namespace)) {
    throw new DataSourceError(
      FEED_DATA_DEFAULT_NAMESPACE,
      "invalid-option",
      "namespace must be 1 to 32 lowercase letters and digits starting with a letter.",
    );
  }
  const fail = (message: string) => new DataSourceError(namespace, "invalid-option", message);
  return {
    namespace,
    url: resolveUrl(options.url, fail),
    limit: integerOption(
      "limit",
      options.limit,
      FeedLimits.minLimit,
      FeedLimits.maxLimit,
      FeedLimits.defaultLimit,
      fail,
    ),
    maxBytes: integerOption(
      "maxBytes",
      options.maxBytes,
      FeedLimits.minMaxBytes,
      FeedLimits.maxMaxBytes,
      FeedLimits.defaultMaxBytes,
      fail,
    ),
    timeoutMs: integerOption(
      "timeoutMs",
      options.timeoutMs,
      FeedLimits.minTimeoutMs,
      FeedLimits.maxTimeoutMs,
      FeedLimits.defaultTimeoutMs,
      fail,
    ),
    cacheTtlSeconds: integerOption(
      "cacheTtlSeconds",
      options.cacheTtlSeconds,
      FeedLimits.minCacheTtlSeconds,
      FeedLimits.maxCacheTtlSeconds,
      FeedLimits.defaultCacheTtlSeconds,
      fail,
    ),
    cache: options.cache ?? null,
    fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
    signal: options.signal ?? null,
  };
}

function resolveUrl(value: unknown, fail: (message: string) => Error): URL {
  if (typeof value !== "string") throw fail("url must be an https URL.");
  if (!/^https:\/\//i.test(value)) {
    throw fail("url must be an https URL (only https:// is fetched).");
  }
  const url = checkHttpsUrl(value);
  if (typeof url === "string") throw fail(`url ${url}.`);
  return url;
}

function integerOption(
  name: string,
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
  fail: (message: string) => Error,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw fail(`${name} must be an integer from ${String(min)} to ${String(max)}.`);
  }
  return value;
}
