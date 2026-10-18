import { DataSourceError, isDataNamespace, type DataSourceCache } from "@readmint/data";
import { isMavenCoordinate } from "./isMavenCoordinate.js";
import { isNpmPackageName } from "./isNpmPackageName.js";
import { REGISTRY_DATA_DEFAULT_NAMESPACE } from "./RegistryData.js";
import {
  RegistryLimits,
  type RegistryFetch,
  type RegistrySourceOptions,
} from "./RegistrySourceOptions.js";

export interface ResolvedRegistryOptions {
  readonly namespace: string;
  readonly npm: readonly string[];
  /** `[group, artifact]` pairs. */
  readonly maven: readonly (readonly [string, string])[];
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly cache: DataSourceCache | null;
  readonly fetch: RegistryFetch;
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly signal: AbortSignal | null;
}

/** Checks every option before any I/O; an error names the option and index, never quotes the value. */
export function resolveRegistryOptions(options: RegistrySourceOptions): ResolvedRegistryOptions {
  const namespace: unknown = options.namespace ?? REGISTRY_DATA_DEFAULT_NAMESPACE;
  if (!isDataNamespace(namespace)) {
    throw new DataSourceError(
      REGISTRY_DATA_DEFAULT_NAMESPACE,
      "invalid-option",
      "namespace must be 1 to 32 lowercase letters and digits starting with a letter.",
    );
  }
  const fail = (message: string) => new DataSourceError(namespace, "invalid-option", message);
  const npm = listOption("npm", options.npm, isNpmPackageName, "a valid npm package name", fail);
  const maven = listOption(
    "maven",
    options.maven,
    isMavenCoordinate,
    "a Maven coordinate (group:artifact)",
    fail,
  );
  if (npm.length + maven.length === 0) throw fail("npm or maven needs at least one entry.");
  return {
    namespace,
    npm,
    maven: maven.map((coordinate) => splitCoordinate(coordinate)),
    maxBytes: integerOption(
      "maxBytes",
      options.maxBytes,
      RegistryLimits.minMaxBytes,
      RegistryLimits.maxMaxBytes,
      RegistryLimits.defaultMaxBytes,
      fail,
    ),
    timeoutMs: integerOption(
      "timeoutMs",
      options.timeoutMs,
      RegistryLimits.minTimeoutMs,
      RegistryLimits.maxTimeoutMs,
      RegistryLimits.defaultTimeoutMs,
      fail,
    ),
    cacheTtlSeconds: integerOption(
      "cacheTtlSeconds",
      options.cacheTtlSeconds,
      RegistryLimits.minCacheTtlSeconds,
      RegistryLimits.maxCacheTtlSeconds,
      RegistryLimits.defaultCacheTtlSeconds,
      fail,
    ),
    cache: options.cache ?? null,
    fetch: options.fetch ?? ((url, init) => globalThis.fetch(url, init)),
    sleep: options.sleep ?? defaultSleep,
    signal: options.signal ?? null,
  };
}

function splitCoordinate(coordinate: string): readonly [string, string] {
  const colon = coordinate.indexOf(":");
  return [coordinate.slice(0, colon), coordinate.slice(colon + 1)];
}

function listOption(
  name: string,
  value: unknown,
  valid: (entry: unknown) => entry is string,
  what: string,
  fail: (message: string) => Error,
): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw fail(`${name} must be an array of strings.`);
  const entries: unknown[] = value;
  if (entries.length > RegistryLimits.maxEntries) {
    throw fail(`${name} takes at most ${String(RegistryLimits.maxEntries)} entries.`);
  }
  const seen = new Set<string>();
  const checked: string[] = [];
  entries.forEach((entry, index) => {
    if (!valid(entry)) throw fail(`${name}[${String(index)}] is not ${what}.`);
    if (seen.has(entry)) throw fail(`${name}[${String(index)}] repeats an earlier entry.`);
    seen.add(entry);
    checked.push(entry);
  });
  return checked;
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
