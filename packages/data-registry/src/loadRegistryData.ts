import {
  dataSourceCacheKey,
  DataSourceError,
  type DataSourceCache,
  type DataSourceLoadResult,
} from "@readmint/data";
import { parseMavenSearch } from "./parseMavenSearch.js";
import { parseNpmDownloads } from "./parseNpmDownloads.js";
import { parseNpmLatest } from "./parseNpmLatest.js";
import { readStoredMaven, readStoredNpm } from "./readStoredEntry.js";
import {
  REGISTRY_DATA_VERSION,
  type MavenArtifact,
  type NpmPackage,
  type RegistryData,
} from "./RegistryData.js";
import { RegistryShapeError } from "./RegistryShapeError.js";
import type { RegistryLoadMeta, RegistrySourceOptions } from "./RegistrySourceOptions.js";
import { mavenSearchUrl, npmDownloadsUrl, npmLatestUrl } from "./registryUrls.js";
import { requestRegistry, type RegistryLabel } from "./requestRegistry.js";
import { resolveRegistryOptions, type ResolvedRegistryOptions } from "./resolveRegistryOptions.js";

interface Run {
  readonly resolved: ResolvedRegistryOptions;
  readonly signal: AbortSignal;
  requests: number;
  entries: number;
  hits: number;
  readonly missing: string[];
}

/**
 * Loads the latest version (and, for npm, the downloads of the last week) of the packages and artifacts named into
 * `{ version: 0, npm, maven }`, in the order given, one request after another. Every option is checked before any
 * I/O. Only registry.npmjs.org, api.npmjs.org and search.maven.org are contacted, over HTTPS, with no secret. An entry
 * a registry does not know is `null` and named in `meta.missing`; every other failure fails the load, so a degraded
 * card is never produced. A found entry is cached per entry, a missing one never. Errors are `DataSourceError`s of
 * fixed text.
 */
export async function loadRegistryData(
  options: RegistrySourceOptions,
): Promise<DataSourceLoadResult<RegistryData, RegistryLoadMeta>> {
  const resolved = resolveRegistryOptions(options);
  try {
    return await load(resolved);
  } catch (error) {
    // The last guard: a foreign error's text was never checked, so none of it leaves.
    if (error instanceof DataSourceError) throw error;
    throw new DataSourceError(resolved.namespace, "invalid-response", "The registry load failed.");
  }
}

async function load(
  resolved: ResolvedRegistryOptions,
): Promise<DataSourceLoadResult<RegistryData, RegistryLoadMeta>> {
  const timeout = AbortSignal.timeout(resolved.timeoutMs);
  const run: Run = {
    resolved,
    signal: resolved.signal ? AbortSignal.any([timeout, resolved.signal]) : timeout,
    requests: 0,
    entries: 0,
    hits: 0,
    missing: [],
  };
  const npm: (NpmPackage | null)[] = [];
  for (const name of resolved.npm) {
    npm.push(
      await entry(
        run,
        "npm",
        name,
        `npm:${name}`,
        (stored) => readStoredNpm(stored, name),
        () => fetchNpm(run, name),
      ),
    );
  }
  const maven: (MavenArtifact | null)[] = [];
  for (const [group, artifact] of resolved.maven) {
    maven.push(
      await entry(
        run,
        "maven",
        `${group}:${artifact}`,
        `maven:${group}:${artifact}`,
        (stored) => readStoredMaven(stored, group, artifact),
        () => fetchMaven(run, group, artifact),
      ),
    );
  }
  const data: RegistryData = Object.freeze({
    version: REGISTRY_DATA_VERSION,
    npm: Object.freeze(npm),
    maven: Object.freeze(maven),
  });
  return {
    data,
    meta: {
      requests: run.requests,
      fromCache: run.hits === run.entries,
      missing: Object.freeze(run.missing),
    },
  };
}

async function entry<T extends NpmPackage | MavenArtifact>(
  run: Run,
  registry: "npm" | "maven",
  id: string,
  label: string,
  read: (stored: string) => T | null,
  fetchEntry: () => Promise<T | null>,
): Promise<T | null> {
  const { cache, namespace, maxBytes, cacheTtlSeconds } = run.resolved;
  run.entries += 1;
  const key =
    cache === null
      ? null
      : await dataSourceCacheKey(
          { namespace, dataVersion: REGISTRY_DATA_VERSION },
          { registry, name: id, maxBytes },
        );
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const hit = stored === undefined ? null : read(stored);
    if (hit !== null) {
      run.hits += 1;
      return hit;
    }
  }
  const found = await fetchEntry();
  if (found === null) {
    run.missing.push(label);
    return null;
  }
  if (cache !== null && key !== null) {
    await writeCache(cache, key, JSON.stringify(found), cacheTtlSeconds);
  }
  return found;
}

async function fetchNpm(run: Run, name: string): Promise<NpmPackage | null> {
  const { resolved, signal } = run;
  const latest = await requestRegistry(npmLatestUrl(name), "npm registry", resolved, signal, true);
  run.requests += latest.requests;
  if (latest.status === 404) return null;
  const version = parsed(resolved, "npm registry", () => parseNpmLatest(latest.text));
  const downloads = await requestRegistry(
    npmDownloadsUrl(name),
    "npm downloads",
    resolved,
    signal,
    true,
  );
  run.requests += downloads.requests;
  const weeklyDownloads =
    downloads.status === 404
      ? null
      : parsed(resolved, "npm downloads", () => parseNpmDownloads(downloads.text));
  return { name, version, weeklyDownloads };
}

async function fetchMaven(
  run: Run,
  group: string,
  artifact: string,
): Promise<MavenArtifact | null> {
  const { resolved, signal } = run;
  const answer = await requestRegistry(
    mavenSearchUrl(group, artifact),
    "Maven Central",
    resolved,
    signal,
    false,
  );
  run.requests += answer.requests;
  return parsed(resolved, "Maven Central", () => parseMavenSearch(answer.text, group, artifact));
}

function parsed<T>(resolved: ResolvedRegistryOptions, label: RegistryLabel, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (!(error instanceof RegistryShapeError)) throw error;
    throw new DataSourceError(
      resolved.namespace,
      "invalid-response",
      `The ${label} answer ${error.message}.`,
    );
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
