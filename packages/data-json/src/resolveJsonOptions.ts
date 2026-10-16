import {
  checkHttpsUrl,
  DataSourceError,
  isDataNamespace,
  type DataSourceCache,
} from "@readmint/data";
import { checkRelativeSource } from "./checkRelativeSource.js";
import { JSON_DATA_DEFAULT_NAMESPACE } from "./JsonData.js";
import {
  JsonLimits,
  type JsonFetch,
  type JsonFileReader,
  type JsonSourceOptions,
} from "./JsonSourceOptions.js";

export type ResolvedJsonSource =
  { readonly kind: "file"; readonly path: string } | { readonly kind: "url"; readonly url: URL };

export interface ResolvedJsonOptions {
  readonly namespace: string;
  readonly source: ResolvedJsonSource;
  /** Lower-cased header name to environment variable name, in option order. */
  readonly headerEnv: readonly (readonly [string, string])[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly cache: DataSourceCache | null;
  readonly fetch: JsonFetch;
  readonly readFile: JsonFileReader | null;
  readonly signal: AbortSignal | null;
}

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;
// RFC 9110 token.
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
// Hop-by-hop or framing headers: fetch sets them itself, and a caller value could smuggle a request.
const REFUSED_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** Checks every option before any I/O; an error names options, never a value from `env`. */
export function resolveJsonOptions(options: JsonSourceOptions): ResolvedJsonOptions {
  const namespace: unknown = options.namespace ?? JSON_DATA_DEFAULT_NAMESPACE;
  if (!isDataNamespace(namespace)) {
    throw new DataSourceError(
      JSON_DATA_DEFAULT_NAMESPACE,
      "invalid-option",
      "namespace must be 1 to 32 lowercase letters and digits starting with a letter.",
    );
  }
  const fail = (message: string) => new DataSourceError(namespace, "invalid-option", message);
  const source = resolveSource(options.source, fail);
  const headerEnv = resolveHeaderNames(options.headers, fail);
  if (headerEnv.length > 0 && source.kind === "file") {
    throw fail("headers apply to URL sources only.");
  }
  return {
    namespace,
    source,
    headerEnv,
    maxBytes: integerOption(
      "maxBytes",
      options.maxBytes,
      JsonLimits.minMaxBytes,
      JsonLimits.maxMaxBytes,
      JsonLimits.defaultMaxBytes,
      fail,
    ),
    timeoutMs: integerOption(
      "timeoutMs",
      options.timeoutMs,
      JsonLimits.minTimeoutMs,
      JsonLimits.maxTimeoutMs,
      JsonLimits.defaultTimeoutMs,
      fail,
    ),
    cacheTtlSeconds: integerOption(
      "cacheTtlSeconds",
      options.cacheTtlSeconds,
      JsonLimits.minCacheTtlSeconds,
      JsonLimits.maxCacheTtlSeconds,
      JsonLimits.defaultCacheTtlSeconds,
      fail,
    ),
    cache: options.cache ?? null,
    fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
    readFile: options.readFile ?? null,
    signal: options.signal ?? null,
  };
}

function resolveSource(value: unknown, fail: (message: string) => Error): ResolvedJsonSource {
  if (typeof value !== "string") throw fail("source must be a file path or an https URL.");
  const scheme = SCHEME.exec(value)?.[1];
  // One letter before the colon is a drive letter, which the file rule refuses.
  if (scheme !== undefined && scheme.length > 1) {
    if (scheme.toLowerCase() !== "https" || !value.slice(scheme.length + 1).startsWith("//")) {
      throw fail("source URL must be an https URL (only https:// is fetched).");
    }
    const url = checkHttpsUrl(value);
    if (typeof url === "string") throw fail(`source URL ${url}.`);
    return { kind: "url", url };
  }
  const problem = checkRelativeSource(value);
  if (problem !== undefined) throw fail(`source file path ${problem}.`);
  return { kind: "file", path: value };
}

function resolveHeaderNames(
  value: unknown,
  fail: (message: string) => Error,
): readonly (readonly [string, string])[] {
  if (value === undefined) return [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw fail("headers must map header names to environment variable names.");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > JsonLimits.maxHeaders) {
    throw fail(`headers may name at most ${String(JsonLimits.maxHeaders)} headers.`);
  }
  const seen = new Set<string>();
  return entries.map(([name, envName]) => {
    if (!HEADER_NAME.test(name)) throw fail("a header name is not a valid HTTP header name.");
    const lower = name.toLowerCase();
    if (REFUSED_HEADERS.has(lower)) throw fail(`header ${lower} cannot be set.`);
    if (seen.has(lower)) throw fail(`header ${lower} is named twice.`);
    seen.add(lower);
    if (typeof envName !== "string" || !ENV_NAME.test(envName)) {
      throw fail(`header ${lower} must name an environment variable (letters, digits, _).`);
    }
    return [lower, envName] as const;
  });
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
