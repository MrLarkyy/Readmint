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
import { parseStoredAdditions } from "./commitAdditionsCache.js";
import { loadAuthoredLanguages, type AuthoredLoad } from "./loadAuthoredLanguages.js";
import { OPTIONAL_MISSES } from "./optionalMisses.js";
import { postGraphQL } from "./postGraphQL.js";
import { newRequestStats, type RequestStats } from "./requestGitHub.js";
import { resolveSourceOptions, type ResolvedSourceOptions } from "./resolveSourceOptions.js";
import { selectPinned } from "./selectPinned.js";

/**
 * Loads one user's profile, public repositories, languages, contribution calendar, pinned
 * repositories with their weekly commits, recent pushes and status.
 * Requests run one after another: the token owner (without `login`, or with a cache or a
 * `languageCommitCap`), the profile,
 * the repository pages up to `maxRepositories`, then the activity and the weekly commits. Every
 * response is validated before use. A GraphQL error in the profile or a repository page fails the
 * whole load; the activity and weekly-commit requests are best effort and, when GitHub refuses
 * them, are named in `meta.partial` (see `OPTIONAL_MISSES`). With a `languageCommitCap` the user's own
 * commits are read last, one REST request each; a stop there is `authored` in `meta.partial`. The token is sent only in the
 * `Authorization` header (GraphQL and REST): no error, result or cache entry contains it.
 */
export async function loadGitHubData(options: GitHubSourceOptions): Promise<GitHubLoadResult> {
  const resolved = resolveSourceOptions(options);
  const stats = newRequestStats();
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
  } else if (cache !== null || resolved.languageCommitCap > 0) {
    // The cache key needs the owner even when the login is given: GitHub's answer about
    // contributions depends on who asks, and private repositories are read for their owner only.
    // Without a usable owner the load runs uncached.
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
          languageCommitCap: resolved.languageCommitCap,
        });
  if (cache !== null && key !== null) {
    const stored = await readCache(cache, key);
    const hit = stored === undefined ? null : readStoredLoad(stored, login, resolved);
    if (hit !== null) {
      if (hit.capped) partial.push("authored-cap");
      return { data: hit.data, meta: loadMeta(stats, rateLimits, true, partial) };
    }
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

  let authored: AuthoredLoad | null = null;
  if (resolved.languageCommitCap > 0) {
    authored = await loadAuthoredLanguages(
      {
        login,
        viewer,
        authorId: profile.id,
        excludeRepositories: resolved.excludeRepositories,
        commitCap: resolved.languageCommitCap,
        cache,
        callerSignal: resolved.signal,
      },
      authoredContext(resolved),
      stats,
      rateLimits,
    );
    if (authored.stopped) partial.push("authored");
    if (authored.capped) partial.push("authored-cap");
  }

  const data = buildGitHubData(
    profile,
    pages,
    resolved.maxRepositories,
    resolved.excludeRepositories,
    activityLoad?.record ?? null,
    weeksLoad?.record ?? null,
    authored?.sums,
  );
  // A degraded load is not stored: a retry would otherwise serve the gap until the entry expires.
  // A capped one is complete for its cap and is stored with that fact.
  if (cache !== null && key !== null && partial.every((part) => part === "authored-cap")) {
    const stored = JSON.stringify({
      profile: profileData,
      pages: pageData,
      activity: activityLoad?.raw ?? null,
      weeks: weeksLoad?.raw ?? null,
      ...(authored === null
        ? {}
        : {
            authored: {
              sums: Object.fromEntries(authored.sums),
              capped: authored.capped,
            },
          }),
    });
    await writeCache(cache, key, stored, resolved.cacheTtlSeconds);
  }
  return { data, meta: loadMeta(stats, rateLimits, false, partial) };
}

type PartialPart = GitHubPartialPart;

// The reading of own commits ends at its own deadline too, which is a partial result; the
// caller's signal, kept apart in `callerSignal`, still fails the load.
function authoredContext(options: ResolvedSourceOptions): ResolvedSourceOptions {
  const { signal, languageSignal } = options;
  if (languageSignal === null) return options;
  return {
    ...options,
    signal: signal === null ? languageSignal : AbortSignal.any([signal, languageSignal]),
  };
}

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

interface StoredLoad {
  readonly data: GitHubData;
  /** The stored load left commits out because of `languageCommitCap`. */
  readonly capped: boolean;
}

/**
 * Rebuilds the data object from a cache entry through the same validation as a fresh load;
 * an entry that fails it, or belongs to another login, is a miss.
 */
function readStoredLoad(
  stored: string,
  login: string,
  options: ResolvedSourceOptions,
): StoredLoad | null {
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
    const authored = options.languageCommitCap > 0 ? readStoredAuthored(parsed) : null;
    if (options.languageCommitCap > 0 && authored === null) return null;
    return {
      data: buildGitHubData(
        profile,
        pages,
        options.maxRepositories,
        options.excludeRepositories,
        activity,
        weeks,
        authored?.sums,
      ),
      capped: authored?.capped ?? false,
    };
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
    requests: stats.requests + stats.restRequests,
    cost: reported.reduce((total, rateLimit) => total + rateLimit.cost, 0),
    rateLimitRemaining: stats.lastRateLimit?.remaining ?? lastReported?.remaining ?? null,
    resetAt: stats.lastRateLimit?.resetAt ?? lastReported?.resetAt ?? null,
    fromCache,
    partial: [...partial],
  };
}

// The sums as stored by a load with a commit cap; anything else is a miss.
function readStoredAuthored(
  stored: JsonRecord,
): { sums: Map<string, number>; capped: boolean } | null {
  const authored = ownField(stored, "authored");
  if (!isJsonRecord(authored)) return null;
  const capped = ownField(authored, "capped");
  const sums = ownField(authored, "sums");
  if (typeof capped !== "boolean" || !isJsonRecord(sums)) return null;
  const parsed = parseStoredAdditions(JSON.stringify({ additions: sums }));
  return parsed === null ? null : { sums: parsed, capped };
}
