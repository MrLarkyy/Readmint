import { computeStreaks } from "./computeStreaks.js";
import {
  GITHUB_DATA_VERSION,
  type GitHubData,
  type GitHubLanguageShare,
  type GitHubRepository,
  type GitHubRepositoryLanguage,
} from "./GitHubData.js";
import type { ProfileRecord, RepositoriesPageRecord } from "./GitHubRecords.js";

/**
 * Assembles the data object from validated records. Every list gets a total order that does not
 * depend on the response order, locale or clock, so the same records give the same bytes.
 */
export function buildGitHubData(
  profile: ProfileRecord,
  pages: readonly RepositoriesPageRecord[],
  maxRepositories: number,
): GitHubData {
  const loaded = uniqueRepositories(
    pages.flatMap((page) => page.repositories.map(copyRepository)).sort(byStars),
  );
  const repositories = loaded.slice(0, maxRepositories);
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
    repositories,
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

// Stars can change between page requests and shift a repository onto two pages; the sorted
// input keeps the copy with more stars.
function uniqueRepositories(sorted: readonly GitHubRepository[]): GitHubRepository[] {
  const seen = new Set<string>();
  const unique: GitHubRepository[] = [];
  for (const repository of sorted) {
    if (seen.has(repository.nameWithOwner)) continue;
    seen.add(repository.nameWithOwner);
    unique.push(repository);
  }
  return unique;
}

function copyRepository(repository: GitHubRepository): GitHubRepository {
  const primary = repository.primaryLanguage;
  return {
    name: repository.name,
    nameWithOwner: repository.nameWithOwner,
    description: repository.description,
    url: repository.url,
    homepageUrl: repository.homepageUrl,
    stars: repository.stars,
    forks: repository.forks,
    isFork: repository.isFork,
    isArchived: repository.isArchived,
    createdAt: repository.createdAt,
    pushedAt: repository.pushedAt,
    primaryLanguage: primary === null ? null : { name: primary.name, color: primary.color },
    languages: repository.languages
      .map((language) => ({ name: language.name, color: language.color, bytes: language.bytes }))
      .sort(byBytes),
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

// Code-unit comparison: localeCompare would order names differently per runtime locale.
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function byStars(left: GitHubRepository, right: GitHubRepository): number {
  return right.stars - left.stars || compareText(left.nameWithOwner, right.nameWithOwner);
}

function byBytes(left: GitHubRepositoryLanguage, right: GitHubRepositoryLanguage): number {
  return right.bytes - left.bytes || compareText(left.name, right.name);
}
