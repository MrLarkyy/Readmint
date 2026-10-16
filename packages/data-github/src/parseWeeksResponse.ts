import { weekAliases } from "./githubQueries.js";
import type { WeeksRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { ResponseReader } from "./ResponseReader.js";

/**
 * Validates the `ReadmintWeeks` data for the requested node `ids`, which GitHub answers in the
 * same order. A node that is null or not a repository has no counts (`null`); a repository
 * without a default branch has none to count and gets zeros.
 */
export function parseWeeksResponse(data: unknown, ids: readonly string[]): WeeksRecord {
  const root = ResponseReader.of(data, "data");
  const nodes = root.field("nodes").items(ids.length);
  if (nodes.length !== ids.length) root.field("nodes").fail(`${String(ids.length)} nodes`);
  const weeks = new Map<string, readonly number[] | null>();
  nodes.forEach((node, index) => {
    const id = ids[index];
    if (id === undefined) return;
    weeks.set(id, parseNode(node, id));
  });
  return { weeks, rateLimit: parseRateLimitField(root) };
}

function parseNode(node: ResponseReader, id: string): number[] | null {
  const repository = node.nullable();
  if (repository === null || !repository.object().hasField("id")) return null;
  if (repository.field("id").string() !== id) repository.field("id").fail("the requested id");
  const branch = repository.field("defaultBranchRef").nullable();
  if (branch === null) return zeros();
  const target = branch.field("target").nullable();
  if (target === null) return zeros();
  return weekAliases.map((alias) => target.field(alias).field("totalCount").count());
}

function zeros(): number[] {
  return new Array<number>(GitHubLimits.weeklyCommitWeeks).fill(0);
}
