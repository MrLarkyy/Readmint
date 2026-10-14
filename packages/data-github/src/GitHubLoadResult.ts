import type { DataSourceLoadMeta } from "@readmint/data";
import type { GitHubData } from "./GitHubData.js";

export interface GitHubLoadResult {
  readonly data: GitHubData;
  /** About this load, kept out of `data` so the data object stays the same between loads. */
  readonly meta: GitHubLoadMeta;
}

export interface GitHubLoadMeta extends DataSourceLoadMeta {
  /** GraphQL rate-limit points the queries cost. */
  readonly cost: number;
  readonly rateLimitRemaining: number | null;
  /** ISO timestamp at which the GraphQL rate limit resets. */
  readonly resetAt: string | null;
}
