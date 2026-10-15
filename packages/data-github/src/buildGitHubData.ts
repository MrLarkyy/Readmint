import { byBytes, collectRepositories } from "./collectRepositories.js";
import { computeStreaks } from "./computeStreaks.js";
import {
  GITHUB_DATA_VERSION,
  type GitHubData,
  type GitHubLanguageShare,
  type GitHubRepository,
} from "./GitHubData.js";
import type { GitHubPinnedRepository } from "./GitHubPinnedRepository.js";
import type {
  ActivityRecord,
  ProfileRecord,
  RepositoriesPageRecord,
  WeeksRecord,
} from "./GitHubRecords.js";
import { selectPinned } from "./selectPinned.js";
import { sortPushes } from "./sortPushes.js";

/**
 * Assembles the data object from validated records; `activity` and `weeks` are `null` when
 * GitHub did not return them. Every list gets a total order that does not
 * depend on the response order, locale or clock, so the same records give the same bytes.
 */
export function buildGitHubData(
  profile: ProfileRecord,
  pages: readonly RepositoriesPageRecord[],
  maxRepositories: number,
  activity: ActivityRecord | null,
  weeks: WeeksRecord | null,
): GitHubData {
  const { loaded, repositories, ids } = collectRepositories(pages, maxRepositories);
  const lastPage = pages.at(-1);
  const sources = repositories.filter((repository) => !repository.isFork);
  const contributions = profile.contributions;
  const days = contributions.days.map((day) => ({
    date: day.date,
    count: day.count,
    level: day.level,
    weekday: day.weekday,
    week: day.week,
  }));
  return {
    version: GITHUB_DATA_VERSION,
    login: profile.login,
    name: profile.name,
    bio: profile.bio,
    company: profile.company,
    location: profile.location,
    websiteUrl: profile.websiteUrl,
    twitterUsername: profile.twitterUsername,
    avatarUrl: profile.avatarUrl,
    url: profile.url,
    createdAt: profile.createdAt,
    followers: profile.followers,
    following: profile.following,
    counts: {
      repositories: pages[0]?.totalCount ?? 0,
      stars: sum(sources.map((repository) => repository.stars)),
      forks: sum(sources.map((repository) => repository.forks)),
    },
    repositories: [...repositories],
    pinned: selectPinned(activity, repositories, ids).map((entry) =>
      withWeeklyCommits(entry.repository, entry.id, weeks),
    ),
    pushes: sortPushes(activity?.recent ?? []),
    status: activity?.status ?? null,
    repositoriesTruncated: loaded.length > maxRepositories || (lastPage?.hasNextPage ?? false),
    languages: languageShares(sources),
    contributions: {
      total: contributions.total,
      commits: contributions.commits,
      pullRequests: contributions.pullRequests,
      issues: contributions.issues,
      reviews: contributions.reviews,
      private: contributions.private,
      from: days[0]?.date ?? "",
      to: days.at(-1)?.date ?? "",
      weeks: contributions.weeks,
      days,
      streaks: computeStreaks(days),
    },
  };
}

function withWeeklyCommits(
  repository: GitHubRepository,
  id: string | null,
  weeks: WeeksRecord | null,
): GitHubPinnedRepository {
  const counts = id === null ? undefined : weeks?.weeks.get(id);
  return {
    ...repository,
    weeklyCommits: counts === undefined || counts === null ? null : [...counts],
  };
}

function languageShares(repositories: readonly GitHubRepository[]): GitHubLanguageShare[] {
  const totals = new Map<string, { color: string | null; bytes: number }>();
  for (const repository of repositories) {
    for (const language of repository.languages) {
      const entry = totals.get(language.name);
      if (entry === undefined) {
        totals.set(language.name, { color: language.color, bytes: language.bytes });
      } else {
        entry.bytes += language.bytes;
        entry.color ??= language.color;
      }
    }
  }
  const languages = [...totals].map(([name, entry]) => ({
    name,
    color: entry.color,
    bytes: entry.bytes,
  }));
  const total = sum(languages.map((language) => language.bytes));
  return languages.sort(byBytes).map((language) => ({
    name: language.name,
    color: language.color,
    bytes: language.bytes,
    share: total === 0 ? 0 : language.bytes / total,
  }));
}

function sum(values: readonly number[]): number {
  return values.reduce((accumulated, value) => accumulated + value, 0);
}
