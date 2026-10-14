import { afterEach, describe, expect, test } from "vitest";
import { isCalendarDate, nextDate, weekdayOf } from "../src/calendarDate.js";
import { computeStreaks, type StreakDay } from "../src/computeStreaks.js";
import { loadGitHubData } from "../src/index.js";
import { FIXTURE_LOGIN, replayFetch, successExchanges } from "./replayFetch.js";

function daysFrom(start: string, counts: readonly number[]): StreakDay[] {
  const days: StreakDay[] = [];
  let date = start;
  for (const count of counts) {
    days.push({ date, count });
    date = nextDate(date);
  }
  return days;
}

const none = { length: 0, start: null, end: null };

describe("computeStreaks", () => {
  test("the current streak ends on the last day when it has contributions", () => {
    const streaks = computeStreaks(daysFrom("2026-03-01", [1, 0, 2, 3, 4]));
    expect(streaks.current).toEqual({ length: 3, start: "2026-03-03", end: "2026-03-05" });
  });

  test("the current streak ends the day before when the last day has none yet", () => {
    const streaks = computeStreaks(daysFrom("2026-03-01", [1, 0, 2, 3, 0]));
    expect(streaks.current).toEqual({ length: 2, start: "2026-03-03", end: "2026-03-04" });
  });

  test("two empty days at the end break the current streak", () => {
    expect(computeStreaks(daysFrom("2026-03-01", [1, 2, 0, 0])).current).toEqual(none);
  });

  test("a gap splits runs and the longest one wins", () => {
    const streaks = computeStreaks(daysFrom("2026-03-01", [1, 1, 0, 1, 1, 1, 0, 1]));
    expect(streaks.longest).toEqual({ length: 3, start: "2026-03-04", end: "2026-03-06" });
    expect(streaks.current).toEqual({ length: 1, start: "2026-03-08", end: "2026-03-08" });
  });

  test("the earliest of equally long runs is the longest", () => {
    const streaks = computeStreaks(daysFrom("2026-03-01", [5, 5, 0, 7, 7, 0]));
    expect(streaks.longest).toEqual({ length: 2, start: "2026-03-01", end: "2026-03-02" });
  });

  test("all zeros and no days give empty streaks", () => {
    expect(computeStreaks(daysFrom("2026-03-01", [0, 0, 0]))).toEqual({
      current: none,
      longest: none,
    });
    expect(computeStreaks([])).toEqual({ current: none, longest: none });
  });

  test("runs cross a year boundary", () => {
    const streaks = computeStreaks(daysFrom("2025-12-30", [1, 1, 1, 1]));
    expect(streaks.longest).toEqual({ length: 4, start: "2025-12-30", end: "2026-01-02" });
  });

  test("runs cross a leap day", () => {
    const days = daysFrom("2024-02-27", [1, 1, 1, 1]);
    expect(days.map((day) => day.date)).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
    expect(computeStreaks(days).longest).toEqual({
      length: 4,
      start: "2024-02-27",
      end: "2024-03-01",
    });
  });
});

describe("calendar dates", () => {
  test("nextDate and weekdayOf use the calendar, not the clock", () => {
    expect(nextDate("2023-02-28")).toBe("2023-03-01");
    expect(nextDate("2025-12-31")).toBe("2026-01-01");
    expect(weekdayOf("2025-10-08")).toBe(3);
    expect(weekdayOf("2024-02-29")).toBe(4);
  });

  test("isCalendarDate rejects impossible days and other formats", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(isCalendarDate("2025-13-01")).toBe(false);
    expect(isCalendarDate("2025-1-01")).toBe(false);
    expect(isCalendarDate("2025-01-01T00:00:00Z")).toBe(false);
  });
});

describe("process timezone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  async function loadFixture(): Promise<string> {
    const replay = replayFetch(successExchanges());
    const { data } = await loadGitHubData({
      token: "test-token",
      login: FIXTURE_LOGIN,
      pageSize: 2,
      fetch: replay.fetch,
    });
    return JSON.stringify(data);
  }

  test("dates, weekdays and streaks do not depend on it", async () => {
    process.env.TZ = "UTC";
    const reference = await loadFixture();
    const sample = daysFrom("2025-12-30", [1, 1, 0, 1]);
    const referenceStreaks = computeStreaks(sample);
    for (const zone of ["Pacific/Kiritimati", "America/Adak"]) {
      process.env.TZ = zone;
      expect(new Date(0).getTimezoneOffset(), zone).not.toBe(0);
      expect(await loadFixture(), zone).toBe(reference);
      expect(computeStreaks(sample), zone).toEqual(referenceStreaks);
      expect(weekdayOf("2025-10-08"), zone).toBe(3);
    }
  });
});
