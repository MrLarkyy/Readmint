import type { GitHubData } from "./GitHubData.js";

export interface GitHubLoadResult {
  readonly data: GitHubData;
  /** About this load, kept out of `data` so the data object stays the same between loads. */
  readonly meta: GitHubLoadMeta;
}

export interface GitHubLoadMeta {
  /** HTTP requests sent, retries included. */
  readonly requests: number;
  /** GraphQL rate-limit points the queries cost. */
  readonly cost: number;
  readonly rateLimitRemaining: number | null;
  /** ISO timestamp at which the GraphQL rate limit resets. */
  readonly resetAt: string | null;
  readonly fromCache: boolean;
}
