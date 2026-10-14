import { GITHUB_DATA_VERSION } from "./GitHubData.js";
import { allQueries } from "./githubQueries.js";
import type { GraphQLOperation } from "./postGraphQL.js";

export interface CacheKeyInput {
  readonly login: string;
  readonly pageSize: number;
  readonly maxRepositories: number;
}

/**
 * SHA-256 hex digest of everything that shapes a cached load: the data version, the query text,
 * the login (case-insensitive, as on GitHub) and the paging options. The token is not an input,
 * so two tokens of the same user share an entry and a cache never stores anything derived from it.
 */
export async function cacheKey(
  input: CacheKeyInput,
  queries: readonly GraphQLOperation[] = allQueries,
): Promise<string> {
  const queryHash = await sha256Hex(queries.map((query) => query.query).join("\n\u0000\n"));
  return sha256Hex(
    JSON.stringify({
      dataVersion: GITHUB_DATA_VERSION,
      queryHash,
      login: input.login.toLowerCase(),
      pageSize: input.pageSize,
      maxRepositories: input.maxRepositories,
    }),
  );
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
