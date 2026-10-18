import { nextDate, weekdayOf } from "./calendarDate.js";
import type { GitHubContributionDay, GitHubContributionLevel } from "./GitHubData.js";
import { GitHubDataError } from "./GitHubDataError.js";
import type { ContributionsRecord, ProfileRecord } from "./GitHubRecords.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { isGitHubLogin } from "./isGitHubLogin.js";
import { parseRateLimitField } from "./parseRateLimitField.js";
import { ResponseReader } from "./ResponseReader.js";

const LEVELS: ReadonlyMap<string, GitHubContributionLevel> = new Map([
  ["NONE", 0],
  ["FIRST_QUARTILE", 1],
  ["SECOND_QUARTILE", 2],
  ["THIRD_QUARTILE", 3],
  ["FOURTH_QUARTILE", 4],
]);

/** Validates the `ReadmintProfile` data; a null `user` is `not-found`. */
export function parseProfileResponse(data: unknown): ProfileRecord {
  const root = ResponseReader.of(data, "data");
  const user = root.field("user").nullable();
  if (user === null) throw new GitHubDataError("not-found", "GitHub has no user with that login.");
  const login = user.field("login");
  const loginText = login.string();
  if (!isGitHubLogin(loginText)) login.fail("a GitHub login");
  return {
    id: user.field("id").string(),
    login: loginText,
    name: user.field("name").nullableString(),
    bio: user.field("bio").nullableString(),
    company: user.field("company").nullableString(),
    location: user.field("location").nullableString(),
    websiteUrl: user.field("websiteUrl").userUrl(),
    twitterUsername: user.field("twitterUsername").nullableString(),
    avatarUrl: user.field("avatarUrl").httpsUrl(),
    url: user.field("url").httpsUrl(),
    createdAt: user.field("createdAt").timestamp(),
    followers: user.field("followers").field("totalCount").count(),
    following: user.field("following").field("totalCount").count(),
    contributions: parseContributions(user.field("contributionsCollection")),
    rateLimit: parseRateLimitField(root),
  };
}

function parseContributions(collection: ResponseReader): ContributionsRecord {
  const calendar = collection.field("contributionCalendar");
  const reported = calendar.field("totalContributions").count();
  const weeks = calendar.field("weeks").items(GitHubLimits.maxCalendarWeeks);
  const days = weeks.flatMap((week, index) => parseWeek(week, index));
  checkCalendar(days, calendar.field("weeks"));
  const sum = days.reduce((accumulated, day) => accumulated + day.count, 0);
  // GitHub counts the whole requested window, but the calendar grid can start a day or two later
  // (on the first Sunday inside it); a total below the days is the malformed case, the rest is the edge.
  if (sum > reported)
    calendar.field("totalContributions").fail("at least the sum of the day counts");
  return {
    total: sum,
    commits: collection.field("totalCommitContributions").count(),
    pullRequests: collection.field("totalPullRequestContributions").count(),
    issues: collection.field("totalIssueContributions").count(),
    reviews: collection.field("totalPullRequestReviewContributions").count(),
    private: collection.field("restrictedContributionsCount").count(),
    weeks: weeks.length,
    days,
  };
}

function parseWeek(week: ResponseReader, index: number): GitHubContributionDay[] {
  const days = week.field("contributionDays");
  const items = days.items(7);
  if (items.length === 0) days.fail("at least one day");
  return items.map((day) => {
    const date = day.field("date").date();
    const weekday = day.field("weekday").count();
    if (weekday !== weekdayOf(date)) day.field("weekday").fail("the weekday of the date");
    return {
      date,
      count: day.field("contributionCount").count(),
      level: day.field("contributionLevel").oneOf(LEVELS),
      weekday,
      week: index,
    };
  });
}

// The calendar is a grid of week columns: days follow each other without gaps, a column runs
// Sunday to Saturday, and only the first and last column may be partial.
function checkCalendar(days: readonly GitHubContributionDay[], weeks: ResponseReader): void {
  if (days.length === 0) weeks.fail("at least one day");
  for (let index = 1; index < days.length; index += 1) {
    const previous = days[index - 1];
    const day = days[index];
    if (previous === undefined || day === undefined) continue;
    if (nextDate(previous.date) !== day.date) weeks.fail("contiguous ascending dates");
    const sameWeek = day.week === previous.week;
    if (sameWeek ? day.weekday !== previous.weekday + 1 : day.weekday !== 0) {
      weeks.fail("weeks running Sunday to Saturday");
    }
  }
}
