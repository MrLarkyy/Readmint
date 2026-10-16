import { copyRepository } from "./copyRepository.js";
import type { GitHubRepository } from "./GitHubData.js";
import type { ActivityRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";

export interface PinnedSelection {
  readonly repository: GitHubRepository;
  /** GraphQL node id; `null` when GitHub gave none, so no weekly counts can be asked for. */
  readonly id: string | null;
}

/**
 * The pinned repositories in pin order; with none (or no activity data) the most starred
 * non-fork repositories, at most `maxPinned` either way.
 */
export function selectPinned(
  activity: ActivityRecord | null,
  repositories: readonly GitHubRepository[],
  ids: ReadonlyMap<string, string>,
): PinnedSelection[] {
  const seen = new Set<string>();
  const pinned: PinnedSelection[] = [];
  for (const entry of activity?.pinned ?? []) {
    if (seen.has(entry.repository.nameWithOwner)) continue;
    seen.add(entry.repository.nameWithOwner);
    pinned.push({ repository: copyRepository(entry.repository), id: entry.id });
  }
  if (pinned.length > 0) return pinned.slice(0, GitHubLimits.maxPinned);
  return repositories
    .filter((repository) => !repository.isFork)
    .slice(0, GitHubLimits.maxPinned)
    .map((repository) => ({ repository, id: ids.get(repository.nameWithOwner) ?? null }));
}
