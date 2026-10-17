import type { DataSourceLoadMeta } from "@readmint/data";
import type { GitHubData } from "./GitHubData.js";

export interface GitHubLoadResult {
  readonly data: GitHubData;
  /** About this load, kept out of `data` so the data object stays the same between loads. */
  readonly meta: GitHubLoadMeta;
}

/**
 * A part of the data that is missing or incomplete: `activity` (status, pushes, pins) or `weeks`
 * (`weeklyCommits`) GitHub refused; `authored` (`languagesAuthored`) stopped early by the rate
 * limit, a network failure or a refused request; `authored-cap` (`languagesAuthored`) counts
 * only the newest commits because `languageCommitCap` left others out.
 */
export type GitHubPartialPart = "activity" | "weeks" | "authored" | "authored-cap";

export interface GitHubLoadMeta extends DataSourceLoadMeta {
  /** GraphQL rate-limit points the queries cost. */
  readonly cost: number;
  readonly rateLimitRemaining: number | null;
  /** ISO timestamp at which the GraphQL rate limit resets. */
  readonly resetAt: string | null;
  /**
   * Parts GitHub refused or answered unusably, so their fields are empty: `activity` (status,
   * pushes, the pinned repositories) and `weeks` (`weeklyCommits`); or incomplete:
   * `authored` and `authored-cap` (`languagesAuthored`). Empty after a complete load.
   */
  readonly partial: readonly GitHubPartialPart[];
}
