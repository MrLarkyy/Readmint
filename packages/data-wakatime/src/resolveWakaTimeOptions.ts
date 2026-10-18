import { DataSourceError, isDataNamespace, type DataSourceCache } from "@readmint/data";
import { WAKATIME_DATA_DEFAULT_NAMESPACE } from "./WakaTimeData.js";
import {
  WAKATIME_RANGES,
  WakaTimeLimits,
  type WakaTimeFetch,
  type WakaTimeRange,
  type WakaTimeSourceOptions,
} from "./WakaTimeSourceOptions.js";

export interface ResolvedWakaTimeOptions {
  readonly namespace: string;
  /** Trimmed, printable ASCII. */
  readonly apiKey: string;
  readonly range: WakaTimeRange;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly cache: DataSourceCache | null;
  readonly fetch: WakaTimeFetch;
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly signal: AbortSignal | null;
}

// Printable ASCII only: a key with CR or LF could inject a header, and none of WakaTime's keys has anything else.
const KEY = /^[\x21-\x7e]+$/;

/** Checks every option before any I/O; an error names the option, never quotes the key. */
export function resolveWakaTimeOptions(options: WakaTimeSourceOptions): ResolvedWakaTimeOptions {
  const namespace: unknown = options.namespace ?? WAKATIME_DATA_DEFAULT_NAMESPACE;
  if (!isDataNamespace(namespace)) {
    throw new DataSourceError(
      WAKATIME_DATA_DEFAULT_NAMESPACE,
      "invalid-option",
      "namespace must be 1 to 32 lowercase letters and digits starting with a letter.",
    );
  }
  const fail = (message: string) => new DataSourceError(namespace, "invalid-option", message);
  return {
    namespace,
    apiKey: apiKeyOption(options.apiKey, namespace),
    range: rangeOption(options.range, fail),
    maxBytes: integerOption(
      "maxBytes",
      options.maxBytes,
      WakaTimeLimits.minMaxBytes,
      WakaTimeLimits.maxMaxBytes,
      WakaTimeLimits.defaultMaxBytes,
      fail,
    ),
    timeoutMs: integerOption(
      "timeoutMs",
      options.timeoutMs,
      WakaTimeLimits.minTimeoutMs,
      WakaTimeLimits.maxTimeoutMs,
      WakaTimeLimits.defaultTimeoutMs,
      fail,
    ),
    cacheTtlSeconds: integerOption(
      "cacheTtlSeconds",
      options.cacheTtlSeconds,
      WakaTimeLimits.minCacheTtlSeconds,
      WakaTimeLimits.maxCacheTtlSeconds,
      WakaTimeLimits.defaultCacheTtlSeconds,
      fail,
    ),
    cache: options.cache ?? null,
    fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
    sleep: options.sleep ?? defaultSleep,
    signal: options.signal ?? null,
  };
}

function apiKeyOption(value: unknown, namespace: string): string {
  const key = typeof value === "string" ? value.trim() : "";
  if (key === "") {
    throw new DataSourceError(namespace, "missing-token", "The WakaTime API key is empty.");
  }
  if (!KEY.test(key)) {
    throw new DataSourceError(
      namespace,
      "invalid-option",
      "The WakaTime API key must be printable ASCII without spaces.",
      { secret: key },
    );
  }
  return key;
}

function rangeOption(value: unknown, fail: (message: string) => Error): WakaTimeRange {
  if (value === undefined) return WakaTimeLimits.defaultRange;
  const range = WAKATIME_RANGES.find((name) => name === value);
  if (range === undefined) throw fail(`range must be one of ${WAKATIME_RANGES.join(", ")}.`);
  return range;
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

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", stop, { once: true });
  });
}
