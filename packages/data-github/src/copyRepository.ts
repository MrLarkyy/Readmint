import { byBytes } from "./byBytes.js";
import type { GitHubRepository } from "./GitHubData.js";

/** A copy with a fixed key order and sorted languages, so the same input gives the same bytes. */
export function copyRepository(repository: GitHubRepository): GitHubRepository {
  const primary = repository.primaryLanguage;
  return {
    name: repository.name,
    nameWithOwner: repository.nameWithOwner,
    description: repository.description,
    url: repository.url,
    homepageUrl: repository.homepageUrl,
    stars: repository.stars,
    forks: repository.forks,
    isFork: repository.isFork,
    isArchived: repository.isArchived,
    createdAt: repository.createdAt,
    pushedAt: repository.pushedAt,
    primaryLanguage: primary === null ? null : { name: primary.name, color: primary.color },
    languages: repository.languages
      .map((language) => ({ name: language.name, color: language.color, bytes: language.bytes }))
      .sort(byBytes),
  };
}
