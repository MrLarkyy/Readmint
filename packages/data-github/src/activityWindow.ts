import { addDays } from "./calendarDate.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";

/** The instants of the activity queries, all UTC midnights derived from the calendar's last day. */
export interface ActivityWindow {
  /** Start of the recent-push window: `recentDays` days ending with the calendar's last day. */
  readonly since: string;
  /** Start of the day after the calendar's last day. */
  readonly until: string;
  /** `weeklyCommitWeeks + 1` ascending week boundaries; the last one is `until`. */
  readonly weekBoundaries: readonly string[];
}

/**
 * Windows measured back from `lastDay` (`contributions.to`) instead of the clock, so the same
 * calendar always asks for the same ranges.
 */
export function activityWindow(lastDay: string): ActivityWindow {
  const end = addDays(lastDay, 1);
  const weeks = GitHubLimits.weeklyCommitWeeks;
  return {
    since: midnight(addDays(lastDay, 1 - GitHubLimits.recentDays)),
    until: midnight(end),
    weekBoundaries: Array.from({ length: weeks + 1 }, (_, index) =>
      midnight(addDays(end, -(weeks - index) * 7)),
    ),
  };
}

function midnight(date: string): string {
  return `${date}T00:00:00Z`;
}
