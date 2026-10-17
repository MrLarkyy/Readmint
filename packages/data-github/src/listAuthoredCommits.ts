import { compareText } from "./compareText.js";
import type { AuthoredCommitRecord, RateLimitRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { isExcludedRepository } from "./isExcludedRepository.js";
import { parseAuthoredHistory } from "./parseAuthoredHistory.js";
import { parseContributedResponse } from "./parseContributedResponse.js";
import { postGraphQL } from "./postGraphQL.js";
import { authoredHistoryQuery, contributedQuery } from "./githubQueries.js";
import type { GitHubRequestContext, RequestStats } from "./requestGitHub.js";

export interface AuthoredCommitListInput {
  readonly login: string;
  /** The token's owner, or `null` when unknown: then no private repository is read. */
  readonly viewer: string | null;
  /** GraphQL node id of the user, the commit author filter. */
  readonly authorId: string;
  readonly excludeRepositories: readonly string[];
}

/**
 * The user's non-merge commits on the default branch of every non-fork repository they committed
 * to, newest first (ties by repository, then commit id). A private repository is read only when
 * the token's owner is the user. Throws on any failed request; the caller decides what that means.
 */
export async function listAuthoredCommits(
  input: AuthoredCommitListInput,
  context: GitHubRequestContext,
  stats: RequestStats,
  rateLimits: (RateLimitRecord | null)[],
): Promise<AuthoredCommitRecord[]> {
  const contributed = parseContributedResponse(
    await postGraphQL(contributedQuery, { login: input.login }, context, stats),
  );
  rateLimits.push(contributed.rateLimit);
  const excluded = new Set(input.excludeRepositories);
  const ownToken = input.viewer?.toLowerCase() === input.login.toLowerCase();
  const wanted = new Map<string, string>();
  for (const repository of contributed.repositories) {
    const name = repository.nameWithOwner.slice(repository.nameWithOwner.indexOf("/") + 1);
    if (repository.isFork || (repository.isPrivate && !ownToken)) continue;
    if (isExcludedRepository(name, repository.nameWithOwner, excluded)) continue;
    wanted.set(repository.id, repository.nameWithOwner);
  }
  const ordered = [...wanted].sort(([, left], [, right]) => compareText(left, right));
  const commits = new Map<string, AuthoredCommitRecord>();
  const size = GitHubLimits.authoredHistoryRepositoriesPerRequest;
  for (let start = 0; start < ordered.length; start += size) {
    const chunk = new Map(ordered.slice(start, start + size));
    const data = await postGraphQL(
      authoredHistoryQuery,
      { ids: [...chunk.keys()], author: input.authorId },
      context,
      stats,
    );
    const history = parseAuthoredHistory(data, chunk);
    rateLimits.push(history.rateLimit);
    for (const commit of history.commits) {
      commits.set(`${commit.nameWithOwner}\u0000${commit.oid}`, commit);
    }
  }
  return [...commits.values()].sort(
    (left, right) =>
      compareText(right.committedDate, left.committedDate) ||
      compareText(left.nameWithOwner, right.nameWithOwner) ||
      compareText(left.oid, right.oid),
  );
}
