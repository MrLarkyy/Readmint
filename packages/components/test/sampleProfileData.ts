import type {
  GitHubContributionDay,
  GitHubContributionLevel,
  GitHubData,
  GitHubRepository,
} from "@readmint/data-github";
import { sampleGitHubData, streaksOf, worstCaseGitHubData } from "./sampleGitHubData.js";

/** One push of `github.pushes`, a field the loader does not produce yet (docs/components.md, Profile templates). */
export interface ProfilePush {
  readonly repository: string;
  readonly hash: string;
  readonly message: string;
  readonly additions: number;
  readonly deletions: number;
  readonly date: string;
}

/** A repository with the weekly commit counts of the last 52 weeks, also not loaded yet. */
export interface ProfileRepository extends GitHubRepository {
  readonly weeklyCommits: readonly number[];
}

/** The data object the profile templates read: `github.*` plus the fields the loader will add. */
export type ProfileData = {
  readonly github: Omit<GitHubData, "repositories"> & {
    readonly repositories: readonly ProfileRepository[];
    readonly pinned: readonly ProfileRepository[];
    readonly status: { readonly emoji: string | null; readonly message: string | null };
    readonly pushes: readonly ProfilePush[];
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
 * add: a status, eight pushes, four pinned repositories with weekly commits, and a longer streak in the calendar.
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
  return {
    github: {
      ...base,
      repositories: [
        ...pinned,
        repository(owner, "dotfiles", null, 120, 9, ["Shell", "#89e051"], 5),
        repository(owner, "scratchpad", "Experiments.", 12, 1, ["HTML", "#e34c26"], 6),
      ],
      pinned,
      status: { emoji: "\u{1F680}", message: "Shipping the 2.0 release" },
      pushes: pushMessages.map((message, index) => ({
        repository: pinned[index % pinned.length]?.name ?? "",
        hash: (0xa3f1c2e + index * 0x1b3d57).toString(16).padStart(7, "0").slice(0, 7),
        message,
        additions: [128, 9, 342, 61, 7, 24, 1800, 95][index] ?? 0,
        deletions: [12, 9, 288, 4, 7, 0, 640, 3][index] ?? 0,
        date: `2026-10-${String(14 - index).padStart(2, "0")}T1${String(index)}:20:00Z`,
      })),
      contributions: withCounts(base, (day, index) =>
        day.count === 0 && index >= 90 && index < 124 ? 1 + (index % 4) : day.count,
      ),
    },
  };
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
      pinned: repositories.slice(0, 4),
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
    weeklyCommits: entry.weeklyCommits.map((count) => (count * 2) % 17),
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
