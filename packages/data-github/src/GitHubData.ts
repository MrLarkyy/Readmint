import type { GitHubPinnedRepository } from "./GitHubPinnedRepository.js";
import type { GitHubPush } from "./GitHubPush.js";
import type { GitHubStatus } from "./GitHubStatus.js";

/** Version of the `github.*` data object; bumped on a rename, removal or change of meaning. */
export const GITHUB_DATA_VERSION = 0;

/** Root name a design binds the data object to, as in `{{github.followers}}`. */
export const GITHUB_DATA_NAMESPACE = "github";

/** Plain-JSON data object of one GitHub user (v0); absent values are `null`, never `undefined`. */
export interface GitHubData {
  readonly version: typeof GITHUB_DATA_VERSION;
  readonly login: string;
  readonly name: string | null;
  readonly bio: string | null;
  readonly company: string | null;
  readonly location: string | null;
  readonly websiteUrl: string | null;
  readonly twitterUsername: string | null;
  readonly avatarUrl: string;
  readonly url: string;
  /** ISO 8601 UTC timestamp. */
  readonly createdAt: string;
  readonly followers: number;
  readonly following: number;
  readonly counts: GitHubCounts;
  readonly repositories: readonly GitHubRepository[];
  /** The pinned repositories, else the six most starred own ones; empty when there are none. */
  readonly pinned: readonly GitHubPinnedRepository[];
  /** The user's commits of the last 7 days, newest first, at most 10; empty when unavailable. */
  readonly pushes: readonly GitHubPush[];
  /** The profile status, `null` when none is set or GitHub did not return it. */
  readonly status: GitHubStatus | null;
  /** True when the account owns more public repositories than were loaded. */
  readonly repositoriesTruncated: boolean;
  readonly languages: readonly GitHubLanguageShare[];
  /**
   * The same languages weighted by repository instead of bytes, so one large repository does not
   * dominate: each non-fork repository counts equally, by its own language shares. Share order.
   */
  readonly languagesByRepo: readonly GitHubLanguageWeight[];
  /** How many of the loaded non-fork repositories use each language, most first. */
  readonly languageRepositories: readonly GitHubLanguageRepositories[];
  /**
   * Languages by the lines the user added in their own newest non-merge commits on the default
   * branch of the non-fork repositories they committed to, share order. Empty unless the loader
   * option `languageCommitCap` is above 0 and the user committed to a file of a known language.
   */
  readonly languagesAuthored: readonly GitHubLanguageAuthored[];
  readonly contributions: GitHubContributions;
}

export interface GitHubCounts {
  /** Public repositories the user owns, including the ones beyond the load cap. */
  readonly repositories: number;
  /** Stars over the loaded repositories that are not forks. */
  readonly stars: number;
  /** Forks over the loaded repositories that are not forks. */
  readonly forks: number;
}

export interface GitHubRepository {
  readonly name: string;
  readonly nameWithOwner: string;
  readonly description: string | null;
  readonly url: string;
  readonly homepageUrl: string | null;
  readonly stars: number;
  readonly forks: number;
  readonly isFork: boolean;
  readonly isArchived: boolean;
  readonly createdAt: string;
  readonly pushedAt: string | null;
  readonly primaryLanguage: GitHubLanguage | null;
  readonly languages: readonly GitHubRepositoryLanguage[];
}

export interface GitHubLanguage {
  readonly name: string;
  /** `#rrggbb`, or `null` when GitHub has no colour for the language. */
  readonly color: string | null;
}

export interface GitHubRepositoryLanguage extends GitHubLanguage {
  readonly bytes: number;
}

export interface GitHubLanguageShare extends GitHubRepositoryLanguage {
  /** `bytes` over all language bytes of the loaded non-fork repositories, 0 to 1. */
  readonly share: number;
}

export interface GitHubLanguageWeight extends GitHubLanguage {
  /** Mean of the language's share within each counted repository, 0 to 1; all shares sum to 1. */
  readonly share: number;
  /** Repositories that list the language. */
  readonly repositories: number;
}

export interface GitHubLanguageRepositories extends GitHubLanguage {
  /** Repositories that list the language. */
  readonly repositories: number;
}

export interface GitHubLanguageAuthored extends GitHubLanguage {
  /** `additions` over the added lines of all languages, 0 to 1. */
  readonly share: number;
  /** Lines the user added in files of the language. */
  readonly additions: number;
}

export interface GitHubContributions {
  readonly total: number;
  readonly commits: number;
  readonly pullRequests: number;
  readonly issues: number;
  readonly reviews: number;
  /** Contributions the token's owner cannot see in detail; 0 with the user's own token. */
  readonly private: number;
  /** First calendar day, `YYYY-MM-DD`. */
  readonly from: string;
  /** Last calendar day, `YYYY-MM-DD`. */
  readonly to: string;
  readonly weeks: number;
  readonly days: readonly GitHubContributionDay[];
  readonly streaks: GitHubStreaks;
}

export interface GitHubContributionDay {
  readonly date: string;
  readonly count: number;
  /** 0 (none) to 4 (fourth quartile), as GitHub colours the calendar. */
  readonly level: GitHubContributionLevel;
  /** 0 = Sunday to 6 = Saturday. */
  readonly weekday: number;
  /** Index of the calendar column (week) the day sits in, from 0. */
  readonly week: number;
}

export type GitHubContributionLevel = 0 | 1 | 2 | 3 | 4;

export interface GitHubStreaks {
  readonly current: GitHubStreak;
  readonly longest: GitHubStreak;
}

export interface GitHubStreak {
  readonly length: number;
  readonly start: string | null;
  readonly end: string | null;
}
