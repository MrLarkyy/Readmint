import { compareText } from "./compareText.js";
import type { GitHubLanguageRepositories, GitHubRepository } from "./GitHubData.js";

/** The number of repositories listing each language; an array, as a language name is free text. */
export function languageRepositories(
  repositories: readonly GitHubRepository[],
): GitHubLanguageRepositories[] {
  const entries = new Map<string, GitHubLanguageRepositories>();
  for (const repository of repositories) {
    for (const language of repository.languages) {
      const entry = entries.get(language.name);
      entries.set(language.name, {
        name: language.name,
        color: entry?.color ?? language.color,
        repositories: (entry?.repositories ?? 0) + 1,
      });
    }
  }
  return [...entries.values()].sort(
    (left, right) => right.repositories - left.repositories || compareText(left.name, right.name),
  );
}
