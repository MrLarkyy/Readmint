import {
  dataSourceCacheKey,
  DataSourceError,
  type DataSourceCache,
  type DataSourceLoadResult,
} from "@readmint/data";
import { fetchJsonDocument } from "./fetchJsonDocument.js";
import { JSON_DATA_VERSION, type JsonData } from "./JsonData.js";
import type { JsonSourceOptions } from "./JsonSourceOptions.js";
import { parseJsonDocument } from "./parseJsonDocument.js";
import { resolveHeaders } from "./resolveHeaders.js";
import { resolveJsonOptions, type ResolvedJsonOptions } from "./resolveJsonOptions.js";

/**
 * Loads one JSON document, a file through the host's `readFile` or an https URL, into
 * `{ version: 0, document }`. Every option is checked before any I/O. A URL load is cached only
 * without headers: an answer to a credential depends on it, and a cache can be shared. Errors are
 * `DataSourceError`s whose message is fixed text and names, with every header value redacted.
 */
export async function loadJsonData(
  options: JsonSourceOptions,
): Promise<DataSourceLoadResult<JsonData>> {
  const resolved = resolveJsonOptions(options);
  const { headers, secrets } = resolveHeaders(resolved.namespace, resolved.headerEnv, options.env);
  try {
    return await load(resolved, headers);
  } catch (error) {
    throw redacted(error, resolved.namespace, secrets);
  }
}

async function load(
  resolved: ResolvedJsonOptions,
  headers: Readonly<Record<string, string>>,
): Promise<DataSourceLoadResult<JsonData>> {
  const { namespace, source } = resolved;
  if (source.kind === "file") {
    if (resolved.readFile === null) {
      throw new DataSourceError(
        namespace,
        "invalid-option",
        "A file source needs a file reader from the host.",
      );
    }
    const bytes = await readFile(resolved.readFile, source.path, resolved.maxBytes, namespace);
    return { data: parseJsonDocument(bytes, namespace), meta: { requests: 0, fromCache: false } };
  }
  const cache = Object.keys(headers).length === 0 ? resolved.cache : null;
  const key =
    cache === null
      ? null
      : await dataSourceCacheKey(
          { namespace, dataVersion: JSON_DATA_VERSION },
          { url: source.url.href, maxBytes: resolved.maxBytes },
        );
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const data = stored === undefined ? null : parseStored(stored, namespace);
    if (data !== null) return { data, meta: { requests: 0, fromCache: true } };
  }
  const fetched = await fetchJsonDocument(source.url, {
    namespace,
    headers,
    maxBytes: resolved.maxBytes,
    timeoutMs: resolved.timeoutMs,
    fetch: resolved.fetch,
    signal: resolved.signal,
  });
  const data = parseJsonDocument(fetched.text, namespace);
  if (cache !== null && key !== null) {
    await writeCache(cache, key, fetched.text, resolved.cacheTtlSeconds);
  }
  return { data, meta: { requests: fetched.requests, fromCache: false } };
}

async function readFile(
  reader: NonNullable<ResolvedJsonOptions["readFile"]>,
  path: string,
  maxBytes: number,
  namespace: string,
): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = await reader(path, maxBytes);
  } catch (error) {
    if (isDataSourceError(error)) {
      throw new DataSourceError(namespace, error.code, error.message);
    }
    throw new DataSourceError(namespace, "invalid-option", "The JSON file could not be read.");
  }
  if (bytes.byteLength > maxBytes) {
    throw new DataSourceError(
      namespace,
      "too-large",
      `The JSON document is larger than ${String(maxBytes)} bytes.`,
    );
  }
  return bytes;
}

// A cache entry is re-validated like a fresh answer; one that fails is a miss.
function parseStored(stored: string, namespace: string): JsonData | null {
  try {
    return parseJsonDocument(stored, namespace);
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

// The last guard: messages are built from fixed text, but nothing that holds a header value may
// leave the loader, nor a foreign error whose text nobody checked.
function redacted(error: unknown, namespace: string, secrets: readonly string[]): DataSourceError {
  if (!isDataSourceError(error)) {
    return new DataSourceError(namespace, "invalid-response", "The JSON load failed.");
  }
  let message = error.message;
  // Case-insensitive: a message may show a lower-cased upstream value, such as a media type.
  for (const secret of secrets) {
    message = message.replace(
      new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      "***",
    );
  }
  return new DataSourceError(error.source, error.code, message);
}

function isDataSourceError(value: unknown): value is DataSourceError {
  return value instanceof DataSourceError;
}
