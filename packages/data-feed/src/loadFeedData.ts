import {
  dataSourceCacheKey,
  DataSourceError,
  fetchHttpsText,
  type DataSourceCache,
  type DataSourceLoadResult,
} from "@readmint/data";
import { buildFeedData } from "./buildFeedData.js";
import { checkFeedMediaType } from "./checkFeedMediaType.js";
import { FEED_DATA_VERSION, type FeedData } from "./FeedData.js";
import type { FeedSourceOptions } from "./FeedSourceOptions.js";
import { parseXml } from "./parseXml.js";
import { readFeed } from "./readFeed.js";
import { resolveFeedOptions, type ResolvedFeedOptions } from "./resolveFeedOptions.js";

const ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9";

/**
 * Loads one RSS 2.0 or Atom 1.0 feed from an https URL into `{ version: 0, title, link, entries }`.
 * Every option is checked before any I/O. The raw document is cached (key: URL and `maxBytes`,
 * never `limit`) and parsed again on every read, so a cached feed meets the same rules and any
 * limit. Errors are `DataSourceError`s whose message is fixed text, never the URL or the document.
 */
export async function loadFeedData(
  options: FeedSourceOptions,
): Promise<DataSourceLoadResult<FeedData>> {
  const resolved = resolveFeedOptions(options);
  try {
    return await load(resolved);
  } catch (error) {
    // The last guard: a foreign error's text was never checked, so none of it leaves.
    if (error instanceof DataSourceError) throw error;
    throw new DataSourceError(resolved.namespace, "invalid-response", "The feed load failed.");
  }
}

async function load(resolved: ResolvedFeedOptions): Promise<DataSourceLoadResult<FeedData>> {
  const { namespace, cache } = resolved;
  const key =
    cache === null
      ? null
      : await dataSourceCacheKey(
          { namespace, dataVersion: FEED_DATA_VERSION },
          { url: resolved.url.href, maxBytes: resolved.maxBytes },
        );
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const data = stored === undefined ? null : parseStored(stored, resolved);
    if (data !== null) return { data, meta: { requests: 0, fromCache: true } };
  }
  const fetched = await fetchHttpsText(resolved.url, {
    namespace,
    label: "feed",
    accept: ACCEPT,
    headers: {},
    checkMediaType: checkFeedMediaType,
    maxBytes: resolved.maxBytes,
    timeoutMs: resolved.timeoutMs,
    fetch: resolved.fetch,
    signal: resolved.signal,
  });
  const data = toFeedData(fetched.text, resolved);
  if (cache !== null && key !== null) {
    await writeCache(cache, key, fetched.text, resolved.cacheTtlSeconds);
  }
  return { data, meta: { requests: fetched.requests, fromCache: false } };
}

function toFeedData(text: string, resolved: ResolvedFeedOptions): FeedData {
  const root = parseXml(text, resolved.namespace);
  return buildFeedData(readFeed(root, resolved.namespace), resolved.url, resolved.limit);
}

// A cache entry is re-validated like a fresh answer; one that fails is a miss.
function parseStored(stored: string, resolved: ResolvedFeedOptions): FeedData | null {
  try {
    return toFeedData(stored, resolved);
  } catch {
    return null;
  }
}

// The cache is best effort: a failing store neither fails the load nor leaks a raw error.
async function readCache(cache: DataSourceCache, key: string): Promise<string | undefined> {
  try {
    return await cache.get(key);
  } catch {
    return undefined;
  }
}

async function writeCache(
  cache: DataSourceCache,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    await cache.set(key, value, ttlSeconds);
  } catch {
    // Ignored on purpose, see readCache.
  }
}
