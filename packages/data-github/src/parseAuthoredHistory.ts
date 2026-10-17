import type { AuthoredCommitRecord, AuthoredHistoryRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { ResponseReader } from "./ResponseReader.js";

const OID_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Validates the `ReadmintAuthoredHistory` data for the requested node `ids` (id to
 * `nameWithOwner`), answered in the same order. A node that is not a repository, a repository without a default branch and merge commits
 * (more than one parent) add no commit.
 */
export function parseAuthoredHistory(
  data: unknown,
  ids: ReadonlyMap<string, string>,
): AuthoredHistoryRecord {
  const root = ResponseReader.of(data, "data");
  const order = [...ids];
  const nodes = root.field("nodes").items(order.length);
  if (nodes.length !== order.length) root.field("nodes").fail(`${String(order.length)} nodes`);
  const commits: AuthoredCommitRecord[] = [];
  nodes.forEach((node, index) => {
    const entry = order[index];
    const repository = node.nullable();
    if (entry === undefined || repository === null || !repository.object().hasField("id")) return;
    const [id, nameWithOwner] = entry;
    if (repository.field("id").string() !== id) repository.field("id").fail("the requested id");
    const branch = repository.field("defaultBranchRef").nullable();
    const target = branch?.field("target").nullable() ?? null;
    if (target === null || !target.hasField("history")) return;
    const history = target.field("history").field("nodes");
    for (const commit of history.items(GitHubLimits.languageCommitsPerRepository)) {
      if (commit.field("parents").field("totalCount").count() > 1) continue;
      const oid = commit.field("oid");
      const value = oid.string();
      if (!OID_PATTERN.test(value)) oid.fail("a 40-digit commit id");
      commits.push({
        nameWithOwner,
        oid: value,
        committedDate: commit.field("committedDate").timestamp(),
      });
    }
  });
  return { commits, rateLimit: parseRateLimitField(root) };
}
