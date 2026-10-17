import { activityWindow } from "./activityWindow.js";
import { buildGitHubData } from "./buildGitHubData.js";
import { cacheKey } from "./cacheKey.js";
import { collectRepositories } from "./collectRepositories.js";
import { checkPageChain, nextPageCursor } from "./checkPageChain.js";
import type { GitHubCache } from "./GitHubCache.js";
import type { GitHubData } from "./GitHubData.js";
import { GitHubDataError, type GitHubDataErrorCode } from "./GitHubDataError.js";
import type { GitHubLoadMeta, GitHubLoadResult, GitHubPartialPart } from "./GitHubLoadResult.js";
import {
  activityQuery,
  profileQuery,
  repositoriesQuery,
  viewerQuery,
  weekBoundaryNames,
  weeksQuery,
} from "./githubQueries.js";
import type {
  ActivityRecord,
  RateLimitRecord,
  RepositoriesPageRecord,
  WeeksRecord,
} from "./GitHubRecords.js";
import type { GitHubSourceOptions } from "./GitHubSourceOptions.js";
import { isGitHubLogin } from "./isGitHubLogin.js";
import { isJsonRecord, ownField, type JsonRecord } from "./jsonRecord.js";
import { parseActivityResponse } from "./parseActivityResponse.js";
import { parseProfileResponse } from "./parseProfileResponse.js";
import { parseRepositoriesPage } from "./parseRepositoriesPage.js";
import { parseViewerResponse } from "./parseViewerResponse.js";
import { parseWeeksResponse } from "./parseWeeksResponse.js";
import { postGraphQL, type RequestStats } from "./postGraphQL.js";
import { resolveSourceOptions, type ResolvedSourceOptions } from "./resolveSourceOptions.js";
import { selectPinned } from "./selectPinned.js";

/**
 * Loads one user's profile, public repositories, languages, contribution calendar, pinned
 * repositories with their weekly commits, recent pushes and status.
 * Requests run one after another: the token owner (without `login`, or with a cache), the profile,
 * the repository pages up to `maxRepositories`, then the activity and the weekly commits. Every
 * response is validated before use. A GraphQL error in the profile or a repository page fails the
 * whole load; the activity and weekly-commit requests are best effort and, when GitHub refuses
 * them, are named in `meta.partial` (see `OPTIONAL_MISSES`). The token is sent only in the
 * `Authorization` header: no error, result or cache entry contains it.
 */
export async function loadGitHubData(options: GitHubSourceOptions): Promise<GitHubLoadResult> {
  const resolved = resolveSourceOptions(options);
  const stats: RequestStats = { requests: 0, lastRateLimit: null };
  const rateLimits: (RateLimitRecord | null)[] = [];
  const partial: PartialPart[] = [];

  const cache = resolved.cache;
  let viewer: string | null = null;
  if (resolved.login === null) {
    viewer = await lookUpOwner(resolved, stats, rateLimits);
    if (!isGitHubLogin(viewer)) {
      throw new GitHubDataError(
        "invalid-option",
        "The token belongs to an app, not a user; pass the login to load.",
      );
    }
  } else if (cache !== null) {
    // The cache key needs the owner even when the login is given: GitHub's answer about
    // contributions depends on who asks. Without a usable owner the load runs uncached.
    viewer = await lookUpOwner(resolved, stats, rateLimits).catch((error: unknown) => {
      if (isOwnerLookupMiss(error)) return null;
      throw error;
    });
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
          excludeRepositories: resolved.excludeRepositories,
        });
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const data = stored === undefined ? null : readStoredLoad(stored, login, resolved);
    if (data !== null) return { data, meta: loadMeta(stats, rateLimits, true, partial) };
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

  const window = activityWindow(profile.contributions.days.at(-1)?.date ?? "");
  const activityVariables = {
    login,
    author: profile.id,
    from: window.since,
    to: window.until,
    since: window.since,
    until: window.until,
  };
  const activityLoad = await loadOptional("activity", partial, async () => {
    const raw = await postGraphQL(activityQuery, activityVariables, resolved, stats);
    return { raw, record: parseActivityResponse(raw) };
  });
  rateLimits.push(activityLoad?.record.rateLimit ?? null);

  const ids = weekIds(
    activityLoad?.record ?? null,
    pages,
    resolved.maxRepositories,
    resolved.excludeRepositories,
  );
  let weeksLoad: { raw: JsonRecord; record: WeeksRecord } | null = null;
  if (ids.length > 0) {
    const weekVariables: Record<string, string | readonly string[]> = { ids, author: profile.id };
    weekBoundaryNames.forEach((name, index) => {
      weekVariables[name] = window.weekBoundaries[index] ?? "";
    });
    weeksLoad = await loadOptional("weeks", partial, async () => {
      const raw = await postGraphQL(weeksQuery, weekVariables, resolved, stats);
      return { raw, record: parseWeeksResponse(raw, ids) };
    });
    rateLimits.push(weeksLoad?.record.rateLimit ?? null);
  }

  const data = buildGitHubData(
    profile,
    pages,
    resolved.maxRepositories,
    resolved.excludeRepositories,
    activityLoad?.record ?? null,
    weeksLoad?.record ?? null,
  );
  // A degraded load is not stored: a retry would otherwise serve the gap until the entry expires.
  if (cache !== null && key !== null && partial.length === 0) {
    const stored = JSON.stringify({
      profile: profileData,
      pages: pageData,
      activity: activityLoad?.raw ?? null,
      weeks: weeksLoad?.raw ?? null,
    });
    await writeCache(cache, key, stored, resolved.cacheTtlSeconds);
  }
  return { data, meta: loadMeta(stats, rateLimits, false, partial) };
}

type PartialPart = GitHubPartialPart;

// The node ids to ask weekly commits for: the pinned selection, each repository once.
function weekIds(
  activity: ActivityRecord | null,
  pages: readonly RepositoriesPageRecord[],
  maxRepositories: number,
  exclude: readonly string[],
): string[] {
  const { repositories, ids } = collectRepositories(pages, maxRepositories, exclude);
  const wanted = selectPinned(activity, repositories, ids).flatMap((entry) =>
    entry.id === null ? [] : [entry.id],
  );
  return [...new Set(wanted)];
}

// Answers about these queries only. A token, rate-limit, network or abort failure would fail the
// profile request just the same, so those still end the load.
const OPTIONAL_MISSES: ReadonlySet<GitHubDataErrorCode> = new Set([
  "graphql",
  "forbidden",
  "http",
  "invalid-response",
  "not-found",
  "too-large",
]);

async function loadOptional<T>(
  part: PartialPart,
  partial: PartialPart[],
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GitHubDataError && OPTIONAL_MISSES.has(error.code)) {
      partial.push(part);
      return null;
    }
    throw error;
  }
}

async function lookUpOwner(
  options: ResolvedSourceOptions,
  stats: RequestStats,
  rateLimits: (RateLimitRecord | null)[],
): Promise<string> {
  const record = parseViewerResponse(await postGraphQL(viewerQuery, {}, options, stats));
  rateLimits.push(record.rateLimit);
  return record.login;
}

// Answers about this one query; a token, rate-limit, network or abort failure would fail the
// profile request just the same, so those still end the load.
const OWNER_LOOKUP_MISSES: ReadonlySet<GitHubDataErrorCode> = new Set([
  "graphql",
  "forbidden",
  "invalid-response",
  "not-found",
]);

function isOwnerLookupMiss(error: unknown): boolean {
  return error instanceof GitHubDataError && OWNER_LOOKUP_MISSES.has(error.code);
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
    // A complete load stores both parts; an entry without them is of an older format.
    const storedActivity = ownField(parsed, "activity");
    const storedWeeks = ownField(parsed, "weeks");
    if (storedActivity === undefined || storedActivity === null || storedWeeks === undefined) {
      return null;
    }
    const activity = parseActivityResponse(storedActivity);
    const ids = weekIds(activity, pages, options.maxRepositories, options.excludeRepositories);
    if (ids.length > 0 !== (storedWeeks !== null)) return null;
    const weeks = storedWeeks === null ? null : parseWeeksResponse(storedWeeks, ids);
    return buildGitHubData(
      profile,
      pages,
      options.maxRepositories,
      options.excludeRepositories,
      activity,
      weeks,
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof GitHubDataError) return null;
    throw error;
  }
}

function loadMeta(
  stats: RequestStats,
  rateLimits: readonly (RateLimitRecord | null)[],
  fromCache: boolean,
  partial: readonly PartialPart[],
): GitHubLoadMeta {
  const reported = rateLimits.filter((rateLimit) => rateLimit !== null);
  const lastReported = reported.at(-1);
  return {
    requests: stats.requests,
    cost: reported.reduce((total, rateLimit) => total + rateLimit.cost, 0),
    rateLimitRemaining: stats.lastRateLimit?.remaining ?? lastReported?.remaining ?? null,
    resetAt: stats.lastRateLimit?.resetAt ?? lastReported?.resetAt ?? null,
    fromCache,
    partial: [...partial],
  };
}
