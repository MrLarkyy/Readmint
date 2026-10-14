import type { GitHubLanguage, GitHubRepository, GitHubRepositoryLanguage } from "./GitHubData.js";
import { GitHubDataError } from "./GitHubDataError.js";
import type { RepositoriesPageRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { ResponseReader } from "./ResponseReader.js";

/** Validates one `ReadmintRepositories` page of at most `pageSize` repositories. */
export function parseRepositoriesPage(data: unknown, pageSize: number): RepositoriesPageRecord {
  const root = ResponseReader.of(data, "data");
  const user = root.field("user").nullable();
  if (user === null) throw new GitHubDataError("not-found", "GitHub has no user with that login.");
  const connection = user.field("repositories");
  const pageInfo = connection.field("pageInfo");
  return {
    totalCount: connection.field("totalCount").count(),
    hasNextPage: pageInfo.field("hasNextPage").boolean(),
    endCursor: pageInfo.field("endCursor").nullableString(),
    repositories: connection.field("nodes").items(pageSize).map(parseRepository),
    rateLimit: parseRateLimitField(root),
  };
}

function parseRepository(node: ResponseReader): GitHubRepository {
  const primaryLanguage = node.field("primaryLanguage").nullable();
  return {
    name: node.field("name").string(),
    nameWithOwner: node.field("nameWithOwner").string(),
    description: node.field("description").nullableString(),
    url: node.field("url").httpsUrl(),
    homepageUrl: node.field("homepageUrl").userUrl(),
    stars: node.field("stargazerCount").count(),
    forks: node.field("forkCount").count(),
    isFork: node.field("isFork").boolean(),
    isArchived: node.field("isArchived").boolean(),
    createdAt: node.field("createdAt").timestamp(),
    pushedAt: node.field("pushedAt").nullableTimestamp(),
    primaryLanguage: primaryLanguage === null ? null : parseLanguage(primaryLanguage),
    languages: parseLanguages(node.field("languages")),
  };
}

function parseLanguages(field: ResponseReader): GitHubRepositoryLanguage[] {
  const languages = field.nullable();
  if (languages === null) return [];
  return languages
    .field("edges")
    .items(GitHubLimits.maxLanguagesPerRepository)
    .map((edge) => ({
      ...parseLanguage(edge.field("node")),
      bytes: edge.field("size").count(),
    }));
}

function parseLanguage(language: ResponseReader): GitHubLanguage {
  return { name: language.field("name").string(), color: language.field("color").colour() };
}
