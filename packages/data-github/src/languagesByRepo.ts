import { compareText } from "./compareText.js";
import type { GitHubLanguageWeight, GitHubRepository } from "./GitHubData.js";

interface Entry {
  color: string | null;
  weight: number;
  repositories: number;
}

/**
 * Every repository counts equally, split over its languages by bytes; a repository without
 * language bytes is not counted. Iterates the given order, so the float sums are reproducible.
 */
export function languagesByRepo(repositories: readonly GitHubRepository[]): GitHubLanguageWeight[] {
  const entries = new Map<string, Entry>();
  let counted = 0;
  for (const repository of repositories) {
    let total = 0;
    for (const language of repository.languages) total += language.bytes;
    if (total > 0) counted += 1;
    for (const language of repository.languages) {
      let entry = entries.get(language.name);
      if (entry === undefined) {
        entry = { color: language.color, weight: 0, repositories: 0 };
        entries.set(language.name, entry);
      }
      entry.color ??= language.color;
      entry.repositories += 1;
      if (total > 0) entry.weight += language.bytes / total;
    }
  }
  return [...entries]
    .map(([name, entry]) => ({
      name,
      color: entry.color,
      share: counted === 0 ? 0 : entry.weight / counted,
      repositories: entry.repositories,
    }))
    .sort(
      (left, right) =>
        right.share - left.share ||
        right.repositories - left.repositories ||
        compareText(left.name, right.name),
    );
}
