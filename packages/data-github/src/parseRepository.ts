import type { GitHubLanguage, GitHubRepository, GitHubRepositoryLanguage } from "./GitHubData.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import type { ResponseReader } from "./ResponseReader.js";

/** Validates the repository fields shared by the repository pages and the pinned items. */
export function parseRepository(node: ResponseReader): GitHubRepository {
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
