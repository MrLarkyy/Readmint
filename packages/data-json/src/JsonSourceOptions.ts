import { HttpsLimits, type DataSourceLoadOptions } from "@readmint/data";

/** Ranges and defaults of the load options, and the fixed caps applied to every document. */
export const JsonLimits = Object.freeze({
  minMaxBytes: 1,
  /** The CLI's fixture limit, so a document that loads here also loads as `--data`. */
  maxMaxBytes: 8 * 1024 * 1024,
  defaultMaxBytes: 1024 * 1024,
  minTimeoutMs: 1000,
  maxTimeoutMs: 60_000,
  defaultTimeoutMs: 10_000,
  minCacheTtlSeconds: 1,
  maxCacheTtlSeconds: 604_800,
  defaultCacheTtlSeconds: 3600,
  /** Redirects followed per load (the shared `HttpsLimits`). */
  maxRedirects: HttpsLimits.maxRedirects,
  /** Nesting of arrays and objects. */
  maxDepth: 64,
  /** Values in the document, containers included. */
  maxNodes: 200_000,
  maxUrlLength: HttpsLimits.maxUrlLength,
  /** UTF-16 code units of a file source. */
  maxSourceLength: 1024,
  maxHeaders: 8,
});

export type JsonLimits = typeof JsonLimits;

/** `fetch` as the loader calls it; injectable so tests answer without a network. */
export type JsonFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Reads a file source given as a checked relative path, refusing more than `maxBytes`. Hosts
 * supply it (`workspaceFileReader` of `@readmint/data-json/node`); it throws a `DataSourceError`.
 */
export type JsonFileReader = (relative: string, maxBytes: number) => Promise<Uint8Array>;

export interface JsonSourceOptions extends DataSourceLoadOptions {
  /** A relative file path inside the host's root, or an `https://` URL. */
  readonly source: string;
  /** Root name in expressions (default `json`); see `isDataNamespace`. */
  readonly namespace?: string;
  /**
   * URL sources only: header name to the name of the environment variable holding its value.
   * Values never appear in an option, an error, a result or a cache key.
   */
  readonly headers?: Readonly<Record<string, string>>;
  /** Where header values are read from; the loader never reads the process environment itself. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Required for a file source. */
  readonly readFile?: JsonFileReader;
  readonly fetch?: JsonFetch;
  /** Document size in bytes, 1 to 8 MiB (default 1 MiB). */
  readonly maxBytes?: number;
  /** Whole URL load, redirects and body included, 1000 to 60000 ms (default 10000). */
  readonly timeoutMs?: number;
  /** Lifetime of a cache entry, 1 to 604800 s (default 3600). */
  readonly cacheTtlSeconds?: number;
}
