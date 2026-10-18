import {
  dataSourceCacheKey,
  DataSourceError,
  sha256Hex,
  type DataSourceCache,
  type DataSourceLoadResult,
} from "@readmint/data";
import { type ParsedStats, parseStatsResponse } from "./parseStatsResponse.js";
import { readStoredData } from "./readStoredData.js";
import { requestWakaTime } from "./requestWakaTime.js";
import { resolveWakaTimeOptions, type ResolvedWakaTimeOptions } from "./resolveWakaTimeOptions.js";
import { WAKATIME_DATA_VERSION, type WakaTimeData } from "./WakaTimeData.js";
import { WakaTimeShapeError } from "./WakaTimeShapeError.js";
import type { WakaTimeLoadMeta, WakaTimeSourceOptions } from "./WakaTimeSourceOptions.js";

/**
 * Loads the coding stats of the API key's own user for one range into `{ version: 0, range, totalSeconds,
 * humanReadableTotal, dailyAverageSeconds, languages, editors, operatingSystems }`. Every option is checked before any
 * I/O. The key goes only into the `Authorization` header of a request to wakatime.com; the cache key holds a
 * domain-separated digest of it (two keys never share an entry), and the entry holds the normalised data object only.
 * A 202 or not-up-to-date answer is `meta.partial` and never cached. Errors are `DataSourceError`s of fixed text.
 */
export async function loadWakaTimeData(
  options: WakaTimeSourceOptions,
): Promise<DataSourceLoadResult<WakaTimeData, WakaTimeLoadMeta>> {
  const resolved = resolveWakaTimeOptions(options);
  try {
    return await load(resolved);
  } catch (error) {
    // The last guard: a foreign error's text was never checked, so none of it leaves.
    if (error instanceof DataSourceError) throw error;
    throw new DataSourceError(resolved.namespace, "invalid-response", "The WakaTime load failed.", {
      secret: resolved.apiKey,
    });
  }
}

async function load(
  resolved: ResolvedWakaTimeOptions,
): Promise<DataSourceLoadResult<WakaTimeData, WakaTimeLoadMeta>> {
  const { cache } = resolved;
  const key = cache === null ? null : await cacheKey(resolved);
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const data = stored === undefined ? null : readStoredData(stored, resolved.range);
    if (data !== null) return { data, meta: { requests: 0, fromCache: true, partial: false } };
  }
  const answer = await requestWakaTime(resolved);
  const parsed = parse(answer.text, answer.status, resolved);
  if (!parsed.partial && cache !== null && key !== null) {
    await writeCache(cache, key, JSON.stringify(parsed.data), resolved.cacheTtlSeconds);
  }
  return {
    data: parsed.data,
    meta: { requests: answer.requests, fromCache: false, partial: parsed.partial },
  };
}

function parse(text: string, status: 200 | 202, resolved: ResolvedWakaTimeOptions): ParsedStats {
  try {
    return parseStatsResponse(text, status, resolved.range);
  } catch (error) {
    if (!(error instanceof WakaTimeShapeError)) throw error;
    throw new DataSourceError(
      resolved.namespace,
      "invalid-response",
      `The WakaTime answer ${error.message}.`,
      { secret: resolved.apiKey },
    );
  }
}

// The account is a digest of the key under a prefix of its own, so the entry is the key's user's, and neither the key
// nor its plain hash is in the cache key or a FileCache file name.
async function cacheKey(resolved: ResolvedWakaTimeOptions): Promise<string> {
  return dataSourceCacheKey(
    { namespace: resolved.namespace, dataVersion: WAKATIME_DATA_VERSION },
    {
      user: "current",
      range: resolved.range,
      maxBytes: resolved.maxBytes,
      account: await sha256Hex(`readmint-wakatime-account\0${resolved.apiKey}`),
    },
  );
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
