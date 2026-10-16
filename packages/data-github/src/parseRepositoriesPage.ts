import { GitHubDataError } from "./GitHubDataError.js";
import type { RepositoriesPageRecord } from "./GitHubRecords.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { parseRepository } from "./parseRepository.js";
import { ResponseReader } from "./ResponseReader.js";

/** Validates one `ReadmintRepositories` page of at most `pageSize` repositories. */
export function parseRepositoriesPage(data: unknown, pageSize: number): RepositoriesPageRecord {
  const root = ResponseReader.of(data, "data");
  const user = root.field("user").nullable();
  if (user === null) throw new GitHubDataError("not-found", "GitHub has no user with that login.");
  const connection = user.field("repositories");
  const pageInfo = connection.field("pageInfo");
  const nodes = connection.field("nodes").items(pageSize);
  return {
    totalCount: connection.field("totalCount").count(),
    hasNextPage: pageInfo.field("hasNextPage").boolean(),
    endCursor: pageInfo.field("endCursor").nullableString(),
    repositories: nodes.map(parseRepository),
    ids: new Map(
      nodes.map((node) => [node.field("nameWithOwner").string(), node.field("id").string()]),
    ),
    rateLimit: parseRateLimitField(root),
  };
}
