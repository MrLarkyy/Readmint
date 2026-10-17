import { GitHubDataError } from "./GitHubDataError.js";
import type { ContributedRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { REPOSITORY_PATTERN } from "./resolveSourceOptions.js";
import { ResponseReader } from "./ResponseReader.js";

/** Validates the `ReadmintContributed` data: the repositories the user committed to. */
export function parseContributedResponse(data: unknown): ContributedRecord {
  const root = ResponseReader.of(data, "data");
  const user = root.field("user").nullable();
  if (user === null) throw new GitHubDataError("not-found", "GitHub has no user with that login.");
  const nodes = user
    .field("repositoriesContributedTo")
    .field("nodes")
    .items(GitHubLimits.maxContributedRepositories);
  const repositories = nodes.flatMap((node) => {
    const repository = node.nullable();
    if (repository === null) return [];
    const nameField = repository.field("nameWithOwner");
    const nameWithOwner = nameField.string();
    if (!nameWithOwner.includes("/") || !REPOSITORY_PATTERN.test(nameWithOwner)) {
      nameField.fail("a repository name with owner");
    }
    return [
      {
        id: repository.field("id").string(),
        nameWithOwner,
        isFork: repository.field("isFork").boolean(),
        isPrivate: repository.field("isPrivate").boolean(),
      },
    ];
  });
  return { repositories, rateLimit: parseRateLimitField(root) };
}
