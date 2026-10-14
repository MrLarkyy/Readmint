import type { GitHubContributionDay, GitHubRepository } from "./GitHubData.js";

/** Validated contents of GitHub responses, before they are assembled into `GitHubData`. */

export interface RateLimitRecord {
  readonly cost: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export interface ViewerRecord {
  readonly login: string;
  readonly rateLimit: RateLimitRecord | null;
}

export interface ProfileRecord {
  readonly login: string;
  readonly name: string | null;
  readonly bio: string | null;
  readonly company: string | null;
  readonly location: string | null;
  readonly websiteUrl: string | null;
  readonly twitterUsername: string | null;
  readonly avatarUrl: string;
  readonly url: string;
  readonly createdAt: string;
  readonly followers: number;
  readonly following: number;
  readonly contributions: ContributionsRecord;
  readonly rateLimit: RateLimitRecord | null;
}

export interface ContributionsRecord {
  readonly total: number;
  readonly commits: number;
  readonly pullRequests: number;
  readonly issues: number;
  readonly reviews: number;
  readonly private: number;
  readonly weeks: number;
  /** Ascending, contiguous, at least one day. */
  readonly days: readonly GitHubContributionDay[];
}

export interface RepositoriesPageRecord {
  readonly totalCount: number;
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
  readonly repositories: readonly GitHubRepository[];
  readonly rateLimit: RateLimitRecord | null;
}
