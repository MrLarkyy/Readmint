import { afterEach, describe, expect, test, vi } from "vitest";
import { activityWindow } from "../src/activityWindow.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("activityWindow", () => {
  test("measures from the calendar's last day", () => {
    const window = activityWindow("2026-10-13");
    expect(window.since).toBe("2026-10-07T00:00:00Z");
    expect(window.until).toBe("2026-10-14T00:00:00Z");
    expect(window.weekBoundaries).toHaveLength(53);
    expect(window.weekBoundaries[0]).toBe("2025-10-15T00:00:00Z");
    expect(window.weekBoundaries[51]).toBe("2026-10-07T00:00:00Z");
    expect(window.weekBoundaries[52]).toBe(window.until);
  });

  test("the last week is the recent-push window", () => {
    const window = activityWindow("2026-10-13");
    expect(window.weekBoundaries[51]).toBe(window.since);
  });

  test("boundaries ascend by exactly 7 days", () => {
    const { weekBoundaries } = activityWindow("2024-03-02");
    for (let index = 1; index < weekBoundaries.length; index += 1) {
      const step =
        Date.parse(weekBoundaries[index] ?? "") - Date.parse(weekBoundaries[index - 1] ?? "");
      expect(step).toBe(7 * 86_400_000);
    }
  });

  test.each([
    ["2026-10-31", "2026-11-01T00:00:00Z", "2026-10-25T00:00:00Z"],
    ["2025-12-31", "2026-01-01T00:00:00Z", "2025-12-25T00:00:00Z"],
    ["2024-02-28", "2024-02-29T00:00:00Z", "2024-02-22T00:00:00Z"],
    ["2024-02-29", "2024-03-01T00:00:00Z", "2024-02-23T00:00:00Z"],
  ])("rolls over months, years and leap days: %s", (lastDay, until, since) => {
    const window = activityWindow(lastDay);
    expect(window.until).toBe(until);
    expect(window.since).toBe(since);
  });

  test("the system clock and timezone have no effect", () => {
    const before = activityWindow("2026-10-13");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("1999-01-01T12:00:00Z"));
    expect(activityWindow("2026-10-13")).toEqual(before);
  });
});
