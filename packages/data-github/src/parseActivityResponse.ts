import type { ActivityRecord, CommitRecord, RecentRepositoryRecord } from "./GitHubRecords.js";
import type { GitHubStatus } from "./GitHubStatus.js";
import { GitHubDataError } from "./GitHubDataError.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { parseRepository } from "./parseRepository.js";
import { ResponseReader } from "./ResponseReader.js";

/**
 * Validates the `ReadmintActivity` data. Private repositories are dropped here, whatever the
 * token can see, so nothing derived from them reaches the data object.
 */
export function parseActivityResponse(data: unknown): ActivityRecord {
  const root = ResponseReader.of(data, "data");
  const user = root.field("user").nullable();
  if (user === null) throw new GitHubDataError("not-found", "GitHub has no user with that login.");
  return {
    status: parseStatus(user.field("status")),
    pinned: parsePinned(user.field("pinnedItems").field("nodes")),
    recent: user
      .field("contributionsCollection")
      .field("commitContributionsByRepository")
      .items(GitHubLimits.maxPushRepositories)
      .flatMap(parseRecent),
    rateLimit: parseRateLimitField(root),
  };
}

function parseStatus(field: ResponseReader): GitHubStatus | null {
  const status = field.nullable();
  if (status === null) return null;
  // A status limited to an organization is visible to its members only, never on the public profile.
  if (status.field("organization").nullable() !== null) return null;
  const message = status.field("message").nullableString();
  const emoji = status.field("emoji").nullableString();
  return message === null && emoji === null ? null : { message, emoji };
}

function parsePinned(nodes: ResponseReader): ActivityRecord["pinned"] {
  return nodes.items(GitHubLimits.maxPinned).flatMap((node) => {
    const item = node.nullable();
    if (item === null || item.field("isPrivate").boolean()) return [];
    return [{ id: item.field("id").string(), repository: parseRepository(item) }];
  });
}

function parseRecent(contribution: ResponseReader): RecentRepositoryRecord[] {
  const repository = contribution.field("repository");
  if (repository.field("isPrivate").boolean()) return [];
  return [
    {
      name: repository.field("name").string(),
      nameWithOwner: repository.field("nameWithOwner").string(),
      commits: parseCommits(repository.field("defaultBranchRef")),
    },
  ];
}

function parseCommits(branch: ResponseReader): CommitRecord[] {
  const ref = branch.nullable();
  if (ref === null) return [];
  const target = ref.field("target").nullable();
  if (target === null) return [];
  return target
    .field("history")
    .field("nodes")
    .items(GitHubLimits.maxCommitsPerRepository)
    .map((commit) => ({
      hash: commit.field("oid").string(),
      message: commit.field("messageHeadline").clippedString(),
      date: commit.field("committedDate").timestamp(),
      additions: commit.field("additions").count(),
      deletions: commit.field("deletions").count(),
    }));
}
