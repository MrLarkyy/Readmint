import type { GitHubRepository } from "./GitHubData.js";

/** A repository shown on the profile, with its commits per week. */
export interface GitHubPinnedRepository extends GitHubRepository {
  /**
   * The user's commits to the default branch in each of the last 52 weeks, oldest week first;
   * `null` when GitHub could not be asked.
   */
  readonly weeklyCommits: readonly number[] | null;
}
