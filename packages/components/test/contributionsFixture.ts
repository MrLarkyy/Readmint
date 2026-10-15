import type { GitHubContributionLevel } from "@readmint/data-github";

/** One day of `github.contributions.days` (docs/data-github.md). */
export interface ContributionDay {
  readonly date: string;
  readonly count: number;
  readonly level: GitHubContributionLevel;
  readonly weekday: number;
  readonly week: number;
}

/** The parts of `github.contributions` the calendar templates read, plus the totals the loader writes. */
export interface Contributions {
  readonly total: number;
  readonly from: string | null;
  readonly to: string | null;
  readonly weeks: number;
  readonly days: readonly ContributionDay[];
}

const dayMs = 86_400_000;

function contributions(
  first: number,
  counts: readonly number[],
  level: (count: number) => GitHubContributionLevel,
) {
  const start = new Date(first).getUTCDay();
  const days = counts.map((count, index): ContributionDay => {
    const date = new Date(first + index * dayMs);
    return {
      date: date.toISOString().slice(0, 10),
      count,
      level: level(count),
      weekday: date.getUTCDay(),
      week: Math.floor((start + index) / 7),
    };
  });
  const last = days.at(-1);
  return {
    github: {
      contributions: {
        total: counts.reduce((sum, count) => sum + count, 0),
        from: days[0]?.date ?? null,
        to: last?.date ?? null,
        weeks: last === undefined ? 0 : last.week + 1,
        days,
      } satisfies Contributions,
    },
  };
}

/** GitHub's quartile levels for this fixture's counts. */
function quartile(count: number): GitHubContributionLevel {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/**
 * A deterministic year shaped like the data-github object: 365 days from a Wednesday, so 53 columns with a partial
 * first and last week; quiet weekends and a quiet fortnight, every level, and one spike far above `maxCount`.
 */
export function contributionsYear() {
  const counts = Array.from({ length: 365 }, (_, index) => {
    if (index >= 150 && index < 164) return 0;
    if (index === 200) return 120;
    const weekday = (3 + index) % 7;
    if ((weekday === 0 || weekday === 6) && index % 3 !== 0) return 0;
    return (index * 7 + ((index * index) % 13)) % 14;
  });
  return contributions(Date.UTC(2024, 9, 16), counts, quartile);
}

/** A calendar with no days, as for an account GitHub shows nothing for. */
export function emptyContributions() {
  return contributions(Date.UTC(2024, 9, 16), [], quartile);
}

/** The largest calendar a template must stay within budget on: 54 columns of 7 days, every count 1000000, level 4. */
export function worstCaseContributions() {
  const sunday = Date.UTC(2024, 9, 13);
  return contributions(
    sunday,
    Array.from({ length: 54 * 7 }, () => 1_000_000),
    () => 4,
  );
}
