import {
  commitCacheKey,
  readCommitAdditions,
  writeCommitAdditions,
} from "./commitAdditionsCache.js";
import type { GitHubCache } from "./GitHubCache.js";
import { GitHubDataError, type GitHubDataErrorCode } from "./GitHubDataError.js";
import type { AuthoredCommitRecord, RateLimitRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { getGitHubJson } from "./getGitHubJson.js";
import { listAuthoredCommits, type AuthoredCommitListInput } from "./listAuthoredCommits.js";
import { OPTIONAL_MISSES } from "./optionalMisses.js";
import { parseCommitFiles } from "./parseCommitFiles.js";
import type { GitHubRequestContext, RequestStats } from "./requestGitHub.js";

export interface AuthoredLoadInput extends AuthoredCommitListInput {
  /** Own commits read at most; above 0. */
  readonly commitCap: number;
  readonly cache: GitHubCache | null;
}

export interface AuthoredLoad {
  /** Added lines per language name. */
  readonly sums: ReadonlyMap<string, number>;
  /** The request budget or an error ended the reading before every commit was counted. */
  readonly stopped: boolean;
  /** Commits were left out because of `commitCap`. */
  readonly capped: boolean;
}

// A stop is a partial result; the caller's abort and a rejected token still fail the load.
const STOPPING: ReadonlySet<GitHubDataErrorCode> = new Set([
  ...OPTIONAL_MISSES,
  "rate-limited",
  "secondary-rate-limited",
  "network",
  "timeout",
]);

/**
 * Counts the lines the user added per language over their newest own commits: the commit list
 * from GraphQL, then one REST read per commit (cached forever, a commit never changes), at most
 * `commitCap`. Requests are sequential and stop when the REST rate limit runs low.
 */
export async function loadAuthoredLanguages(
  input: AuthoredLoadInput,
  context: GitHubRequestContext,
  stats: RequestStats,
  rateLimits: (RateLimitRecord | null)[],
): Promise<AuthoredLoad> {
  const sums = new Map<string, number>();
  let listed: AuthoredCommitRecord[];
  try {
    listed = await listAuthoredCommits(input, context, stats, rateLimits);
  } catch (error) {
    if (!isStop(error, context)) throw error;
    return { sums, stopped: true, capped: false };
  }
  const commits = listed.slice(0, input.commitCap);
  let stopped = false;
  for (const commit of commits) {
    const additions = await readCommit(commit, input, context, stats);
    if (additions === "stop") {
      stopped = true;
      break;
    }
    if (additions === "skip") continue;
    for (const [name, added] of additions) sums.set(name, (sums.get(name) ?? 0) + added);
  }
  return { sums, stopped, capped: listed.length > commits.length };
}

async function readCommit(
  commit: AuthoredCommitRecord,
  input: AuthoredLoadInput,
  context: GitHubRequestContext,
  stats: RequestStats,
): Promise<Map<string, number> | "skip" | "stop"> {
  const cache = input.cache;
  const key =
    cache === null || input.viewer === null
      ? null
      : await commitCacheKey(input.viewer, commit.nameWithOwner, commit.oid);
  if (cache !== null && key !== null) {
    const cached = await readCommitAdditions(cache, key);
    if (cached !== null) return cached;
  }
  const remaining = stats.lastRestRateLimit?.remaining ?? null;
  if (remaining !== null && remaining < GitHubLimits.restRateLimitFloor) return "stop";
  const [owner = "", name = ""] = commit.nameWithOwner.split("/");
  try {
    const { json } = await getGitHubJson(
      ["repos", owner, name, "commits", commit.oid],
      context,
      stats,
    );
    const additions = parseCommitFiles(json);
    if (cache !== null && key !== null) await writeCommitAdditions(cache, key, additions);
    return additions;
  } catch (error) {
    if (!isStop(error, context)) throw error;
    return error instanceof GitHubDataError && OPTIONAL_MISSES.has(error.code) ? "skip" : "stop";
  }
}

function isStop(error: unknown, context: GitHubRequestContext): boolean {
  if (!(error instanceof GitHubDataError) || !STOPPING.has(error.code)) return false;
  return !(error.code === "timeout" && context.signal?.aborted === true);
}
