import type { GitHubContributionDay, GitHubRepository } from "./GitHubData.js";
import type { GitHubStatus } from "./GitHubStatus.js";

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
  /** GraphQL node id, the commit author filter of the activity queries. */
  readonly id: string;
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
  /** GraphQL node id by `nameWithOwner`. */
  readonly ids: ReadonlyMap<string, string>;
  readonly rateLimit: RateLimitRecord | null;
}

/** A public repository the user pinned, with its node id. */
export interface PinnedRecord {
  readonly id: string;
  readonly repository: GitHubRepository;
}

export interface CommitRecord {
  readonly hash: string;
  readonly message: string;
  readonly date: string;
  readonly additions: number;
  readonly deletions: number;
}

/** The user's recent commits to one public repository's default branch. */
export interface RecentRepositoryRecord {
  readonly name: string;
  readonly nameWithOwner: string;
  readonly commits: readonly CommitRecord[];
}

export interface ActivityRecord {
  readonly status: GitHubStatus | null;
  /** Public pinned repositories in pin order. */
  readonly pinned: readonly PinnedRecord[];
  readonly recent: readonly RecentRepositoryRecord[];
  readonly rateLimit: RateLimitRecord | null;
}

export interface WeeksRecord {
  /** Weekly commit counts by repository id; `null` for a node GitHub did not return as one. */
  readonly weeks: ReadonlyMap<string, readonly number[] | null>;
  readonly rateLimit: RateLimitRecord | null;
}
