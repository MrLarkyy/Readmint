import { isJsonRecord, type JsonRecord } from "./jsonRecord.js";

/**
 * The `ReadmintActivity` data without what `parseActivityResponse` drops: private pinned items, contributions to
 * private repositories (their commit headlines too) and a status limited to an organization. A cache entry stores
 * this, so it holds nothing that never reaches the data object; the shape is kept, so the stored answer still goes
 * through `parseActivityResponse`. Both functions share the rules, change them together.
 */
export function stripActivityResponse(data: JsonRecord): JsonRecord {
  const user = data.user;
  if (!isJsonRecord(user)) return data;
  const status = user.status;
  const pinned = user.pinnedItems;
  const collection = user.contributionsCollection;
  return {
    ...data,
    user: {
      ...user,
      ...(status === undefined
        ? {}
        : { status: isJsonRecord(status) && status.organization !== null ? null : status }),
      ...(isJsonRecord(pinned) && Array.isArray(pinned.nodes)
        ? { pinnedItems: { ...pinned, nodes: pinned.nodes.filter((node) => !isPrivate(node)) } }
        : {}),
      ...(isJsonRecord(collection) && Array.isArray(collection.commitContributionsByRepository)
        ? {
            contributionsCollection: {
              ...collection,
              commitContributionsByRepository: collection.commitContributionsByRepository.filter(
                (contribution: unknown) =>
                  !(isJsonRecord(contribution) && isPrivate(contribution.repository)),
              ),
            },
          }
        : {}),
    },
  };
}

function isPrivate(node: unknown): boolean {
  return isJsonRecord(node) && node.isPrivate !== false;
}
