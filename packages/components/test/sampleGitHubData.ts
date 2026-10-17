import type {
  GitHubContributionDay,
  GitHubContributions,
  GitHubData,
  GitHubLanguageRepositories,
  GitHubLanguageShare,
  GitHubLanguageWeight,
  GitHubStreak,
} from "@readmint/data-github";
import { contributionsYear, worstCaseContributions } from "./contributionsFixture.js";

type Days = readonly GitHubContributionDay[];

/** The streaks the loader would compute (docs/data-github.md): `longest` is the earliest of the longest runs. */
export function streaksOf(days: Days): GitHubContributions["streaks"] {
  const none: GitHubStreak = { length: 0, start: null, end: null };
  let longest = none;
  let run: GitHubStreak = none;
  const runs: GitHubStreak[] = [];
  days.forEach((day, index) => {
    if (day.count > 0) {
      run = { length: run.length + 1, start: run.start ?? day.date, end: day.date };
      const last = days[index + 1];
      if (last === undefined || last.count === 0) runs.push(run);
    } else {
      run = none;
    }
  });
  for (const candidate of runs) if (candidate.length > longest.length) longest = candidate;
  const last = days.at(-1);
  const before = days.at(-2);
  const endsAt = last !== undefined && last.count > 0 ? last : before;
  const current = runs.find((candidate) => candidate.end === endsAt?.date && endsAt.count > 0);
  return { current: current ?? none, longest };
}

function contributionsOf(
  source: ReturnType<typeof contributionsYear>["github"]["contributions"],
  totals: Pick<GitHubContributions, "commits" | "pullRequests" | "issues" | "reviews">,
): GitHubContributions {
  const days = source.days;
  return {
    ...totals,
    total: source.total,
    private: 0,
    from: days[0]?.date ?? "",
    to: days.at(-1)?.date ?? "",
    weeks: source.weeks,
    days,
    streaks: streaksOf(days),
  };
}

/** Synthetic, deterministic data of an invented account: shaped like the data-github object, with nobody's real data. */
export function sampleGitHubData(): { github: GitHubData } {
  const year = contributionsYear().github.contributions;
  const shares: readonly (readonly [string, string | null, number])[] = [
    ["TypeScript", "#3178c6", 420],
    ["Python", "#3572a5", 210],
    ["Go", "#00add8", 130],
    ["Rust", "#dea584", 90],
    ["Shell", "#89e051", 70],
    ["HTML", null, 50],
    ["Dockerfile", "#384d54", 30],
  ];
  const languages: GitHubLanguageShare[] = shares.map(([name, color, thousandths]) => ({
    name,
    color,
    bytes: thousandths * 1000,
    share: thousandths / 1000,
  }));
  // The repository weighting orders the languages differently from the bytes, as a dominant repository would.
  const weights: readonly (readonly [string, string | null, number, number])[] = [
    ["Python", "#3572a5", 250, 14],
    ["TypeScript", "#3178c6", 200, 9],
    ["Go", "#00add8", 150, 8],
    ["Shell", "#89e051", 120, 12],
    ["Rust", "#dea584", 100, 5],
    ["HTML", null, 100, 7],
    ["Dockerfile", "#384d54", 80, 6],
  ];
  const languagesByRepo: GitHubLanguageWeight[] = weights.map(
    ([name, color, thousandths, repositories]) => ({
      name,
      color,
      share: thousandths / 1000,
      repositories,
    }),
  );
  const languageRepositories: GitHubLanguageRepositories[] = weights
    .map(([name, color, , repositories]) => ({ name, color, repositories }))
    .sort((left, right) => right.repositories - left.repositories);
  return {
    github: {
      version: 0,
      login: "readmint-sample",
      name: "Sample Developer",
      bio: "Builds small tools and writes about them.",
      company: null,
      location: "Prague",
      websiteUrl: null,
      twitterUsername: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      url: "https://github.com/readmint-sample",
      createdAt: "2016-04-02T09:30:00Z",
      followers: 1840,
      following: 62,
      counts: { repositories: 48, stars: 12_450, forks: 380 },
      repositories: [],
      pinned: [],
      pushes: [],
      status: null,
      repositoriesTruncated: false,
      languages,
      languagesByRepo,
      languageRepositories,
      languagesAuthored: [],
      contributions: contributionsOf(year, {
        commits: 2310,
        pullRequests: 164,
        issues: 41,
        reviews: 97,
      }),
    },
  };
}

const longText = (length: number, char = "W") => char.repeat(length);

/**
 * The data a template must stay within budget on: 1024-character name, login and bio, 600 languages with
 * 1024-character names, counts of 10^15 and 54 calendar columns at 1000000 contributions a day.
 */
export function worstCaseGitHubData(): { github: GitHubData } {
  const sample = sampleGitHubData().github;
  const calendar = worstCaseContributions().github.contributions;
  const huge = 1e15;
  return {
    github: {
      ...sample,
      login: longText(1024),
      name: longText(1024),
      bio: longText(1024),
      followers: huge,
      following: huge,
      counts: { repositories: huge, stars: huge, forks: huge },
      languages: Array.from({ length: 600 }, (_, index) => ({
        name: longText(1024, String.fromCharCode(65 + (index % 26))),
        color: index % 2 === 0 ? "#ff00ff" : null,
        bytes: huge,
        share: 1 / 600,
      })),
      languagesByRepo: Array.from({ length: 600 }, (_, index) => ({
        name: longText(1024, String.fromCharCode(65 + (index % 26))),
        color: index % 2 === 0 ? "#ff00ff" : null,
        share: 1 / 600,
        repositories: 1,
      })),
      languageRepositories: Array.from({ length: 600 }, (_, index) => ({
        name: longText(1024, String.fromCharCode(65 + (index % 26))),
        color: index % 2 === 0 ? "#ff00ff" : null,
        repositories: 1,
      })),
      languagesAuthored: Array.from({ length: 600 }, (_, index) => ({
        name: longText(1024, String.fromCharCode(65 + (index % 26))),
        color: index % 2 === 0 ? "#ff00ff" : null,
        share: 1 / 600,
        additions: 1,
      })),
      contributions: contributionsOf(calendar, {
        commits: huge,
        pullRequests: huge,
        issues: huge,
        reviews: huge,
      }),
    },
  };
}

/** The sample with `name` and `bio` null, no languages and no streaks: what a sparse account looks like. */
export function sparseGitHubData(): { github: GitHubData } {
  const sample = sampleGitHubData().github;
  const none: GitHubStreak = { length: 0, start: null, end: null };
  return {
    github: {
      ...sample,
      name: null,
      bio: null,
      languages: [],
      languagesByRepo: [],
      languageRepositories: [],
      languagesAuthored: [],
      contributions: {
        ...sample.contributions,
        streaks: { current: none, longest: none },
      },
    },
  };
}
