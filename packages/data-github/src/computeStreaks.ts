import type { GitHubStreak, GitHubStreaks } from "./GitHubData.js";

export interface StreakDay {
  readonly date: string;
  readonly count: number;
}

const NO_STREAK: GitHubStreak = { length: 0, start: null, end: null };

/**
 * Streaks over consecutive calendar days (ascending, without gaps) with a count above 0.
 * Longest: the earliest of the longest runs. Current: the run ending on the last day, or on the
 * day before when the last day has no contributions yet (GitHub's day may not be over).
 */
export function computeStreaks(days: readonly StreakDay[]): GitHubStreaks {
  return { current: currentStreak(days), longest: longestStreak(days) };
}

function longestStreak(days: readonly StreakDay[]): GitHubStreak {
  let best = NO_STREAK;
  let start = 0;
  for (let index = 0; index <= days.length; index += 1) {
    const day = days[index];
    if (day !== undefined && day.count > 0) continue;
    const length = index - start;
    if (length > best.length) best = runOf(days, start, index - 1);
    start = index + 1;
  }
  return best;
}

function currentStreak(days: readonly StreakDay[]): GitHubStreak {
  const last = days.length - 1;
  const lastDay = days[last];
  if (lastDay === undefined) return NO_STREAK;
  const end = lastDay.count > 0 ? last : last - 1;
  if ((days[end]?.count ?? 0) === 0) return NO_STREAK;
  let start = end;
  while ((days[start - 1]?.count ?? 0) > 0) start -= 1;
  return runOf(days, start, end);
}

function runOf(days: readonly StreakDay[], start: number, end: number): GitHubStreak {
  return {
    length: end - start + 1,
    start: days[start]?.date ?? null,
    end: days[end]?.date ?? null,
  };
}
