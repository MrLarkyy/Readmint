import { compareText } from "./compareText.js";
import { copyRepository } from "./copyRepository.js";
import type { GitHubRepository } from "./GitHubData.js";
import type { RepositoriesPageRecord } from "./GitHubRecords.js";
import { isExcludedRepository } from "./isExcludedRepository.js";

export interface CollectedRepositories {
  /** Unique repositories by stars, then name, before the cap. */
  readonly loaded: readonly GitHubRepository[];
  /** The first `maxRepositories` of `loaded`, without the excluded ones. */
  readonly repositories: readonly GitHubRepository[];
  /** GraphQL node id by `nameWithOwner`. */
  readonly ids: ReadonlyMap<string, string>;
}

/** The repositories of all pages in one total order that does not depend on the response order. */
export function collectRepositories(
  pages: readonly RepositoriesPageRecord[],
  maxRepositories: number,
  exclude: readonly string[],
): CollectedRepositories {
  const loaded = uniqueRepositories(
    pages.flatMap((page) => page.repositories.map(copyRepository)).sort(byStars),
  );
  const ids = new Map<string, string>();
  for (const page of pages) {
    for (const [name, id] of page.ids) ids.set(name, id);
  }
  const excluded = new Set(exclude);
  const repositories = loaded
    .slice(0, maxRepositories)
    .filter(
      (repository) => !isExcludedRepository(repository.name, repository.nameWithOwner, excluded),
    );
  return { loaded, repositories, ids };
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

function byStars(left: GitHubRepository, right: GitHubRepository): number {
  return right.stars - left.stars || compareText(left.nameWithOwner, right.nameWithOwner);
}
