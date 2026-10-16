import { compareText } from "./compareText.js";
import type { GitHubPush } from "./GitHubPush.js";
import type { ActivityRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";

/**
 * The commits of all recent repositories, newest first with a name and hash tie-break, one per
 * repository and commit, at most `maxPushes`.
 */
export function sortPushes(recent: ActivityRecord["recent"]): GitHubPush[] {
  const entries = recent.flatMap((repository) =>
    repository.commits.map((commit) => ({
      key: repository.nameWithOwner,
      push: {
        repository: repository.name,
        hash: commit.hash.slice(0, 7),
        message: commit.message,
        additions: commit.additions,
        deletions: commit.deletions,
        date: commit.date,
      },
      fullHash: commit.hash,
      time: Date.parse(commit.date),
    })),
  );
  entries.sort(
    (left, right) =>
      right.time - left.time ||
      compareText(left.key, right.key) ||
      compareText(left.fullHash, right.fullHash),
  );
  const seen = new Set<string>();
  const pushes: GitHubPush[] = [];
  for (const entry of entries) {
    const id = `${entry.key}\u0000${entry.fullHash}`;
    if (seen.has(id)) continue;
    seen.add(id);
    pushes.push(entry.push);
    if (pushes.length === GitHubLimits.maxPushes) break;
  }
  return pushes;
}
