import { buildGitHubData } from "./buildGitHubData.js";
import { cacheKey } from "./cacheKey.js";
import { checkPageChain, nextPageCursor } from "./checkPageChain.js";
import type { GitHubCache } from "./GitHubCache.js";
import type { GitHubData } from "./GitHubData.js";
import { GitHubDataError } from "./GitHubDataError.js";
import type { GitHubLoadMeta, GitHubLoadResult } from "./GitHubLoadResult.js";
import { profileQuery, repositoriesQuery, viewerQuery } from "./githubQueries.js";
import type { RateLimitRecord, RepositoriesPageRecord } from "./GitHubRecords.js";
import type { GitHubSourceOptions } from "./GitHubSourceOptions.js";
import { isJsonRecord, ownField, type JsonRecord } from "./jsonRecord.js";
import { parseProfileResponse } from "./parseProfileResponse.js";
import { parseRepositoriesPage } from "./parseRepositoriesPage.js";
import { parseViewerResponse } from "./parseViewerResponse.js";
import { postGraphQL, type RequestStats } from "./postGraphQL.js";
import { resolveSourceOptions, type ResolvedSourceOptions } from "./resolveSourceOptions.js";

/**
 * Loads one user's profile, public repositories, languages and contribution calendar.
 * Requests run one after another: the viewer (without `login`, or with a cache), the profile,
 * then the repository pages up to `maxRepositories`. Every response is validated before use, any
 * GraphQL error fails the whole load, and the token is sent only in the `Authorization`
 * header: no error, result or cache entry contains it.
 */
export async function loadGitHubData(options: GitHubSourceOptions): Promise<GitHubLoadResult> {
  const resolved = resolveSourceOptions(options);
  const stats: RequestStats = { requests: 0, lastRateLimit: null };
  const rateLimits: (RateLimitRecord | null)[] = [];

  const cache = resolved.cache;
  // With a cache the viewer is needed for the key even when the login is given: GitHub's answer
  // about contributions depends on who asks.
  let viewer: string | null = null;
  if (resolved.login === null || cache !== null) {
    const record = parseViewerResponse(await postGraphQL(viewerQuery, {}, resolved, stats));
    rateLimits.push(record.rateLimit);
    viewer = record.login;
  }
  const login = resolved.login ?? viewer;
  if (login === null) {
    throw new GitHubDataError("invalid-response", "GitHub did not name the token's owner.");
  }

  const key =
    cache === null || viewer === null
      ? null
      : await cacheKey({
          viewer,
          login,
          pageSize: resolved.pageSize,
          maxRepositories: resolved.maxRepositories,
        });
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const data = stored === undefined ? null : readStoredLoad(stored, login, resolved);
    if (data !== null) return { data, meta: loadMeta(stats, rateLimits, true) };
  }

  const profileData = await postGraphQL(profileQuery, { login }, resolved, stats);
  const profile = parseProfileResponse(profileData);
  rateLimits.push(profile.rateLimit);

  const pageData: JsonRecord[] = [];
  const pages: RepositoriesPageRecord[] = [];
  const usedCursors = new Set<string>();
  const maxPages = Math.ceil(resolved.maxRepositories / resolved.pageSize);
  let loaded = 0;
  let after: string | null = null;
  for (;;) {
    const variables = { login, first: resolved.pageSize, after };
    const data = await postGraphQL(repositoriesQuery, variables, resolved, stats);
    const page = parseRepositoriesPage(data, resolved.pageSize);
    pageData.push(data);
    pages.push(page);
    rateLimits.push(page.rateLimit);
    loaded += page.repositories.length;
    if (!page.hasNextPage || loaded >= resolved.maxRepositories || pages.length >= maxPages) break;
    after = nextPageCursor(page, usedCursors);
  }

  const data = buildGitHubData(profile, pages, resolved.maxRepositories);
  if (cache !== null && key !== null) {
    const stored = JSON.stringify({ profile: profileData, pages: pageData });
    await writeCache(cache, key, stored, resolved.cacheTtlSeconds);
  }
  return { data, meta: loadMeta(stats, rateLimits, false) };
}

// The cache is best effort: the loaded data is valid either way, so a failing store (read-only
// directory, full disk, a locked file) neither fails the load nor leaks a raw error.
async function readCache(cache: GitHubCache, key: string): Promise<string | undefined> {
  try {
    return await cache.get(key);
  } catch {
    return undefined;
  }
}

async function writeCache(
  cache: GitHubCache,
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

/**
 * Rebuilds the data object from a cache entry through the same validation as a fresh load;
 * an entry that fails it, or belongs to another login, is a miss.
 */
function readStoredLoad(
  stored: string,
  login: string,
  options: ResolvedSourceOptions,
): GitHubData | null {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isJsonRecord(parsed)) return null;
    const storedPages = ownField(parsed, "pages");
    const maxPages = Math.ceil(options.maxRepositories / options.pageSize);
    if (!Array.isArray(storedPages) || storedPages.length < 1 || storedPages.length > maxPages) {
      return null;
    }
    const profile = parseProfileResponse(ownField(parsed, "profile"));
    if (profile.login.toLowerCase() !== login.toLowerCase()) return null;
    const pages = storedPages.map((page: unknown) => parseRepositoriesPage(page, options.pageSize));
    checkPageChain(pages);
    return buildGitHubData(profile, pages, options.maxRepositories);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof GitHubDataError) return null;
    throw error;
  }
}

function loadMeta(
  stats: RequestStats,
  rateLimits: readonly (RateLimitRecord | null)[],
  fromCache: boolean,
): GitHubLoadMeta {
  const reported = rateLimits.filter((rateLimit) => rateLimit !== null);
  const lastReported = reported.at(-1);
  return {
    requests: stats.requests,
    cost: reported.reduce((total, rateLimit) => total + rateLimit.cost, 0),
    rateLimitRemaining: stats.lastRateLimit?.remaining ?? lastReported?.remaining ?? null,
    resetAt: stats.lastRateLimit?.resetAt ?? lastReported?.resetAt ?? null,
    fromCache,
  };
}
