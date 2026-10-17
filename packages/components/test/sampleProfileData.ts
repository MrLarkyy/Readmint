import type {
  GitHubContributionDay,
  GitHubContributionLevel,
  GitHubData,
  GitHubPinnedRepository,
  GitHubPush,
} from "@readmint/data-github";
import { sampleGitHubData, streaksOf, worstCaseGitHubData } from "./sampleGitHubData.js";

/** One push of `github.pushes`, as the loader produces it. */
export type ProfilePush = GitHubPush;

/** A repository with the weekly commit counts of the last 52 weeks (`github.pinned[]`). */
export type ProfileRepository = GitHubPinnedRepository;

/**
 * The data object the profile templates read: `github.*` as the loader produces it. The sample also gives
 * `repositories[]` weekly commits, which the loader does not, so the templates' `github.repositories` fallback is
 * exercised with the same numbers.
 */
export type ProfileData = {
  readonly github: Omit<GitHubData, "repositories"> & {
    readonly repositories: readonly ProfileRepository[];
  };
};

function level(count: number): GitHubContributionLevel {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/** The calendar with its counts replaced, totals, levels and streaks written the way the loader writes them. */
function withCounts(
  github: GitHubData,
  count: (day: GitHubContributionDay, index: number) => number,
): GitHubData["contributions"] {
  const days = github.contributions.days.map((day, index) => {
    const next = count(day, index);
    return { ...day, count: next, level: level(next) };
  });
  return {
    ...github.contributions,
    total: days.reduce((sum, day) => sum + day.count, 0),
    days,
    streaks: streaksOf(days),
  };
}

function repository(
  owner: string,
  name: string,
  description: string | null,
  stars: number,
  forks: number,
  language: readonly [string, string],
  seed: number,
  weeklyCommits?: readonly number[],
): ProfileRepository {
  return {
    name,
    nameWithOwner: `${owner}/${name}`,
    description,
    url: `https://github.com/${owner}/${name}`,
    homepageUrl: null,
    stars,
    forks,
    isFork: false,
    isArchived: false,
    createdAt: "2021-03-01T10:00:00Z",
    pushedAt: "2026-10-14T18:20:00Z",
    primaryLanguage: { name: language[0], color: language[1] },
    languages: [{ name: language[0], color: language[1], bytes: 120_000 }],
    weeklyCommits:
      weeklyCommits ??
      Array.from(
        { length: 52 },
        (_, week) => ((week * 7 + seed * 3) % 11) + (week % 6 === seed % 6 ? 9 : 0),
      ),
  };
}

const pushMessages = [
  "Add a retry budget to the fetch queue",
  "Fix off-by-one in the week grouping",
  "Refactor the config loader into small modules",
  "Document the cache invalidation rules",
  "Bump the parser to the new grammar version",
  "Handle empty responses without throwing",
  "Speed up the index build by batching writes",
  "Add tests for the retry budget",
];

/**
 * Synthetic, deterministic data of the invented account of `sampleGitHubData`, with the fields the profile templates
 * add: a status, eight pushes, six pinned repositories with weekly commits, and a longer streak in the calendar.
 */
export function sampleProfileData(): ProfileData {
  const base = sampleGitHubData().github;
  const owner = "readmint-sample";
  const pinned = [
    repository(
      owner,
      "tinydb",
      "An embedded key-value store with a tiny, readable core.",
      4210,
      188,
      ["Rust", "#dea584"],
      1,
    ),
    repository(
      owner,
      "pagewright",
      "Static pages from plain Markdown, no config files.",
      2760,
      94,
      ["TypeScript", "#3178c6"],
      2,
    ),
    repository(
      owner,
      "gantry",
      "A deploy runner for small teams that run their own servers.",
      1180,
      41,
      ["Go", "#00add8"],
      3,
    ),
    repository(
      owner,
      "notebook-kit",
      "Helpers for reproducible analysis notebooks.",
      640,
      22,
      ["Python", "#3572a5"],
      4,
    ),
  ];
  const repositories = [
    ...pinned,
    repository(owner, "dotfiles", null, 120, 9, ["Shell", "#89e051"], 5),
    repository(owner, "scratchpad", "Experiments.", 12, 1, ["HTML", "#e34c26"], 6),
  ];
  return {
    github: {
      ...base,
      repositories,
      pinned: repositories,
      status: { emoji: "\u{1F680}", message: "Shipping the 2.0 release" },
      pushes: pushMessages.map((message, index) => ({
        repository: pinned[index % pinned.length]?.name ?? "",
        hash: (0xa3f1c2e + index * 0x1b3d57).toString(16).padStart(7, "0").slice(0, 7),
        message,
        additions: [128, 9, 342, 61, 7, 24, 1800, 95][index] ?? 0,
        deletions: [12, 9, 288, 4, 7, 0, 640, 3][index] ?? 0,
        // the calendar ends on 2025-10-15: today, yesterday, then one push a day back
        date: `2025-10-${String(15 - index).padStart(2, "0")}T1${String(index)}:20:00Z`,
      })),
      contributions: withCounts(base, (day, index) =>
        day.count === 0 && index >= 90 && index < 124 ? 1 + (index % 4) : day.count,
      ),
    },
  };
}

/**
 * The sample with a sparse, spiky calendar of 369 days ending on the sample's last day: about 60 % zero days in runs,
 * busy days of 1 to 12 commits and peaks of 30 to 120, one of them far above the rest. Real accounts look like this
 * more often than the sample does.
 */
export function sparseProfileData(): ProfileData {
  const sample = sampleProfileData();
  const dayMs = 86_400_000;
  const first = Date.UTC(2025, 9, 15) - 368 * dayMs;
  const startWeekday = new Date(first).getUTCDay();
  let seed = 20251015;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const counts: number[] = [];
  while (counts.length < 369) {
    const idle = 1 + Math.floor(next() * 9);
    for (let i = 0; i < idle; i++) counts.push(0);
    const busy = 1 + Math.floor(next() * 6);
    for (let i = 0; i < busy; i++) {
      const roll = next();
      counts.push(roll < 0.08 ? 30 + Math.floor(next() * 31) : 1 + Math.floor(next() * 12));
    }
  }
  counts.length = 369;
  counts[300] = 120;
  const days = counts.map((count, index) => {
    const date = new Date(first + index * dayMs);
    return {
      date: date.toISOString().slice(0, 10),
      count,
      level: level(count),
      weekday: date.getUTCDay(),
      week: Math.floor((startWeekday + index) / 7),
    };
  });
  const last = days.at(-1);
  return {
    github: {
      ...sample.github,
      contributions: {
        ...sample.github.contributions,
        total: counts.reduce((sum, count) => sum + count, 0),
        from: new Date(first).toISOString().slice(0, 10),
        to: "2025-10-15",
        weeks: last === undefined ? 0 : last.week + 1,
        days,
        streaks: streaksOf(days),
      },
    },
  };
}

type CalendarDay = ProfileData["github"]["contributions"]["days"][number];

function withCalendar(counts: readonly number[]): ProfileData {
  const sample = sampleProfileData();
  const dayMs = 86_400_000;
  const first = Date.UTC(2025, 9, 15) - (counts.length - 1) * dayMs;
  const startWeekday = new Date(first).getUTCDay();
  const days: CalendarDay[] = counts.map((count, index) => {
    const date = new Date(first + index * dayMs);
    return {
      date: date.toISOString().slice(0, 10),
      count,
      level: level(count),
      weekday: date.getUTCDay(),
      week: Math.floor((startWeekday + index) / 7),
    };
  });
  const last = days.at(-1);
  return {
    github: {
      ...sample.github,
      contributions: {
        ...sample.github.contributions,
        total: counts.reduce((sum, count) => sum + count, 0),
        from: days[0]?.date ?? sample.github.contributions.from,
        weeks: last === undefined ? 0 : last.week + 1,
        days,
        streaks: streaksOf(days),
      },
    },
  };
}

/** The sample with a year of 369 days and no contribution on any of them. */
export function zeroYearProfileData(): ProfileData {
  return withCalendar(Array.from({ length: 369 }, () => 0));
}

/** The sample with a calendar that has no days at all. */
export function noDaysProfileData(): ProfileData {
  return withCalendar([]);
}

/** The sample with a year of 369 days of which only the one third from the end (a Monday) has contributions. */
export function oneDayStreakProfileData(): ProfileData {
  return withCalendar(Array.from({ length: 369 }, (_, index) => (index === 366 ? 3 : 0)));
}

const long = (length: number, char = "W") => char.repeat(length);

/** The data a profile section must stay within budget on: 1024-character texts, 10^15 counts, 600 pushes. */
export function worstCaseProfileData(): ProfileData {
  const base = worstCaseGitHubData().github;
  const huge = 1e15;
  const week = Array.from({ length: 52 }, () => huge);
  const repositories = Array.from({ length: 6 }, (_, index) =>
    repository(
      long(1024),
      long(1024),
      long(1024),
      huge,
      huge,
      [long(1024), "#ff00ff"],
      index,
      week,
    ),
  );
  return {
    github: {
      ...base,
      repositories,
      pinned: repositories,
      status: { emoji: long(64), message: long(1024) },
      pushes: Array.from({ length: 600 }, (_, index) => ({
        repository: long(1024),
        hash: long(1024),
        message: long(1024, index % 2 === 0 ? "W" : "i"),
        additions: huge,
        deletions: huge,
        date: "2026-10-14T18:20:00Z",
      })),
    },
  };
}

/** Another invented account: its login, counts, languages, calendar and repositories all differ from the sample. */
export function otherProfileData(): ProfileData {
  const sample = sampleProfileData().github;
  const base = sampleGitHubData().github;
  const pinned = sample.pinned.map((entry, index) => ({
    ...entry,
    name: `other-${String(index)}`,
    nameWithOwner: `other-dev/other-${String(index)}`,
    description: `The ${String(index + 1)}. project of another developer.`,
    stars: 90 + index * 7,
    forks: 3 + index,
    weeklyCommits: (entry.weeklyCommits ?? []).map((count) => (count * 2) % 17),
  }));
  return {
    github: {
      ...sample,
      login: "other-dev",
      name: "Other Developer",
      bio: "Writes compilers on weekends.",
      location: "Brno",
      followers: 310,
      counts: { repositories: 12, stars: 640, forks: 30 },
      languages: [
        { name: "Kotlin", color: "#a97bff", bytes: 800_000, share: 0.8 },
        { name: "Java", color: "#b07219", bytes: 200_000, share: 0.2 },
      ],
      languagesByRepo: [
        { name: "Java", color: "#b07219", share: 0.6, repositories: 6 },
        { name: "Kotlin", color: "#a97bff", share: 0.4, repositories: 4 },
      ],
      languageRepositories: [
        { name: "Java", color: "#b07219", repositories: 6 },
        { name: "Kotlin", color: "#a97bff", repositories: 4 },
      ],
      languagesAuthored: [
        { name: "Kotlin", color: "#a97bff", share: 0.7, additions: 7000 },
        { name: "Java", color: "#b07219", share: 0.3, additions: 3000 },
      ],
      repositories: pinned,
      pinned,
      status: { emoji: null, message: "Reading papers" },
      pushes: sample.pushes.map((push, index) => ({
        ...push,
        repository: `other-${String(index % 4)}`,
        message: `Other change ${String(index + 1)}`,
      })),
      contributions: withCounts(base, (day, index) => (index % 3 === 0 ? 0 : (day.count % 6) + 1)),
    },
  };
}

/** The sample data of an account with no status set, as GitHub returns it for most users. */
export function noStatusProfileData(): ProfileData {
  const data = sampleProfileData();
  return { github: { ...data.github, status: null } };
}

/** The sample data with no status and no pushes: the headers' two empty rows. */
export function noPushProfileData(): ProfileData {
  const data = noStatusProfileData();
  return { github: { ...data.github, pushes: [] } };
}

/** The sample data with the given location, for headers that fit it by drawn width. */
export function longLocationProfileData(location: string): ProfileData {
  const data = sampleProfileData();
  return { github: { ...data.github, location } };
}

/**
 * The sample data with realistic long texts (RM-123): long repository names in the first three pushes, a long push
 * message, and a first repository whose 54-character name and three-line description overflow its card.
 */
export function longTextProfileData(): ProfileData {
  const data = sampleProfileData();
  const longName = "a-very-long-repository-name-that-keeps-going-and-going";
  const names = [
    longName,
    "repo_with_underscores_and_numbers_1234567890",
    "ěščřžýáié-čeština-repo",
  ];
  const [first, ...rest] = data.github.repositories;
  const repositories =
    first === undefined
      ? rest
      : [
          {
            ...first,
            name: longName,
            nameWithOwner: `readmint-sample/${longName}`,
            description:
              "Renders GitHub profile cards from plain JSON designs: themes, embedded webfonts, animated charts and a preview that matches the output.",
          },
          ...rest,
        ];
  return {
    github: {
      ...data.github,
      repositories,
      pinned: repositories,
      pushes: data.github.pushes.map((push, index) => ({
        ...push,
        repository: names[index] ?? push.repository,
        message:
          index === 0
            ? "Rework the incremental build cache so renamed files keep their history and stale entries are evicted early"
            : push.message,
      })),
    },
  };
}

/** Names GitHub really uses as the top three of an account (the fourth is not drawn as a label). */
export const longLanguageNames: readonly string[] = [
  "Jupyter Notebook",
  "Visual Basic .NET",
  "Objective-C++",
  "Other",
];

/** The sample data with the given language names and shares (default 40, 20, 20 and 20 %), every language list alike. */
export function longLanguageProfileData(
  names: readonly string[] = longLanguageNames,
  shares: readonly number[] = [0.4, 0.2, 0.2, 0.2],
): ProfileData {
  const data = sampleProfileData();
  const listed = names.map((name, index) => ({
    name,
    color: "#3572a5",
    share: shares[index] ?? 0,
  }));
  return {
    github: {
      ...data.github,
      languages: listed.map((entry) => ({ ...entry, bytes: Math.round(entry.share * 1_000_000) })),
      languagesByRepo: listed.map((entry) => ({ ...entry, repositories: 5 })),
      languagesAuthored: listed.map((entry) => ({
        ...entry,
        additions: Math.round(entry.share * 10_000),
      })),
    },
  };
}
