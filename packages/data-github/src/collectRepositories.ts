import type { GitHubRepository, GitHubRepositoryLanguage } from "./GitHubData.js";
import type { RepositoriesPageRecord } from "./GitHubRecords.js";

export interface CollectedRepositories {
  /** Unique repositories by stars, then name, before the cap. */
  readonly loaded: readonly GitHubRepository[];
  /** The first `maxRepositories` of `loaded`. */
  readonly repositories: readonly GitHubRepository[];
  /** GraphQL node id by `nameWithOwner`. */
  readonly ids: ReadonlyMap<string, string>;
}

/** The repositories of all pages in one total order that does not depend on the response order. */
export function collectRepositories(
  pages: readonly RepositoriesPageRecord[],
  maxRepositories: number,
): CollectedRepositories {
  const loaded = uniqueRepositories(
    pages.flatMap((page) => page.repositories.map(copyRepository)).sort(byStars),
  );
  const ids = new Map<string, string>();
  for (const page of pages) {
    for (const [name, id] of page.ids) ids.set(name, id);
  }
  return { loaded, repositories: loaded.slice(0, maxRepositories), ids };
}

// Stars can change between page requests and shift a repository onto two pages; the sorted
// input keeps the copy with more stars.
function uniqueRepositories(sorted: readonly GitHubRepository[]): GitHubRepository[] {
  const seen = new Set<string>();
  const unique: GitHubRepository[] = [];
  for (const repository of sorted) {
    if (seen.has(repository.nameWithOwner)) continue;
    seen.add(repository.nameWithOwner);
    unique.push(repository);
  }
  return unique;
}

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

/** Code-unit comparison: localeCompare would order names differently per runtime locale. */
export function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function byStars(left: GitHubRepository, right: GitHubRepository): number {
  return right.stars - left.stars || compareText(left.nameWithOwner, right.nameWithOwner);
}

export function byBytes(left: GitHubRepositoryLanguage, right: GitHubRepositoryLanguage): number {
  return right.bytes - left.bytes || compareText(left.name, right.name);
}
