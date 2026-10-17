import { dataSourceCacheKey, sha256Hex } from "@readmint/data";
import { GITHUB_DATA_NAMESPACE, GITHUB_DATA_VERSION } from "./GitHubData.js";
import { allQueries } from "./githubQueries.js";
import type { GraphQLOperation } from "./postGraphQL.js";

export interface CacheKeyInput {
  /** The token's owner: GitHub answers contribution queries relative to the viewer. */
  readonly viewer: string;
  readonly login: string;
  readonly pageSize: number;
  readonly maxRepositories: number;
  /** Lowercased and sorted; part of the key only when not empty. */
  readonly excludeRepositories?: readonly string[];
}

/**
 * SHA-256 hex digest of everything that shapes a cached load: the data version, the query text,
 * the viewer and the login (case-insensitive, as on GitHub) and the paging options. The viewer is
 * in it because GitHub counts private contributions only for the user's own token; the token
 * itself is not, so a cache never stores anything derived from it.
 */
export async function cacheKey(
  input: CacheKeyInput,
  queries: readonly GraphQLOperation[] = allQueries,
): Promise<string> {
  const queryHash = await sha256Hex(queries.map((query) => query.query).join("\n\u0000\n"));
  return dataSourceCacheKey(
    { namespace: GITHUB_DATA_NAMESPACE, dataVersion: GITHUB_DATA_VERSION },
    {
      queryHash,
      viewer: input.viewer.toLowerCase(),
      login: input.login.toLowerCase(),
      pageSize: input.pageSize,
      maxRepositories: input.maxRepositories,
      ...(input.excludeRepositories === undefined || input.excludeRepositories.length === 0
        ? {}
        : { excludeRepositories: input.excludeRepositories.join(",") }),
    },
  );
}
