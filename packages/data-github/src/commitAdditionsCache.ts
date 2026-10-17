import { dataSourceCacheKey } from "@readmint/data";
import { AUTHORED_LANGUAGE_COLORS, AUTHORED_TABLE_VERSION } from "./authoredLanguageTable.js";
import type { GitHubCache } from "./GitHubCache.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { isJsonRecord, ownField } from "./jsonRecord.js";

/** A commit's content never changes, so its sums are kept for the longest lifetime. */
export const COMMIT_CACHE_TTL_SECONDS = GitHubLimits.maxCacheTtlSeconds;

const COMMIT_NAMESPACE = "github-commit";

/** Key of one commit's sums; the table version in it makes a changed table miss. */
export function commitCacheKey(
  viewer: string,
  nameWithOwner: string,
  oid: string,
): Promise<string> {
  return dataSourceCacheKey(
    { namespace: COMMIT_NAMESPACE, dataVersion: AUTHORED_TABLE_VERSION },
    { viewer: viewer.toLowerCase(), repository: nameWithOwner.toLowerCase(), oid },
  );
}

export function serializeAdditions(additions: ReadonlyMap<string, number>): string {
  return JSON.stringify({ additions: Object.fromEntries(additions) });
}

/** Sums from a stored entry; `null` for anything that is not exactly what was written. */
export function parseStoredAdditions(text: string): Map<string, number> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const additions = isJsonRecord(parsed) ? ownField(parsed, "additions") : undefined;
  if (!isJsonRecord(additions)) return null;
  const sums = new Map<string, number>();
  for (const [name, value] of Object.entries(additions)) {
    if (!AUTHORED_LANGUAGE_COLORS.has(name)) return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
    sums.set(name, value);
  }
  return sums;
}

export async function readCommitAdditions(
  cache: GitHubCache,
  key: string,
): Promise<Map<string, number> | null> {
  try {
    const text = await cache.get(key);
    return text === undefined ? null : parseStoredAdditions(text);
  } catch {
    return null;
  }
}

export async function writeCommitAdditions(
  cache: GitHubCache,
  key: string,
  additions: ReadonlyMap<string, number>,
): Promise<void> {
  try {
    await cache.set(key, serializeAdditions(additions), COMMIT_CACHE_TTL_SECONDS);
  } catch {
    // The cache is best effort, as for the main entry.
  }
}
