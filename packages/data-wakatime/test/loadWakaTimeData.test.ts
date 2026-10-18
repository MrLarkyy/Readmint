import { describe, expect, test } from "vitest";
import { loadWakaTimeData, WAKATIME_RANGES, WakaTimeLimits } from "../src/index.js";
import { CANARY_KEY, fixture, stats, stubFetch, json } from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");
const EXPECTED: unknown = JSON.parse(fixture("expected-wakatime-data.json"));

describe("loadWakaTimeData", () => {
  test("the fixture answer becomes exactly the expected data object", async () => {
    const stub = stubFetch(() => json(STATS));
    const result = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch });
    expect(result.data).toEqual(EXPECTED);
    expect(result.meta).toEqual({ requests: 1, fromCache: false, partial: false });
  });

  test("two loads give JSON-identical data, frozen all the way down", async () => {
    const load = () =>
      loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stubFetch(() => json(STATS)).fetch });
    const first = await load();
    const second = await load();
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
    expect(Object.isFrozen(first.data)).toBe(true);
    expect(Object.isFrozen(first.data.languages)).toBe(true);
    expect(Object.isFrozen(first.data.languages[0])).toBe(true);
  });

  test("projects, machines, dependencies and the user name never reach the data", async () => {
    const result = await loadWakaTimeData({
      apiKey: CANARY_KEY,
      fetch: stubFetch(() => json(STATS)).fetch,
    });
    const text = JSON.stringify(result.data);
    for (const hidden of [
      "secret-client-project",
      "work-laptop-7",
      "private-internal-lib",
      "private-user",
    ]) {
      expect(text).not.toContain(hidden);
    }
  });

  test("lists are sorted by time then by name in code-unit order, and capped at 20", async () => {
    const languages = Array.from({ length: 30 }, (_, i) => ({
      name: `L${String(i).padStart(2, "0")}`,
      total_seconds: i < 4 ? 100 : i,
      percent: 1,
    }));
    languages.push({ name: "b", total_seconds: 100, percent: 1 });
    languages.push({ name: "Z", total_seconds: 100, percent: 1 });
    const stub = stubFetch(() =>
      stats({ total_seconds: 1, daily_average: 1, languages, editors: [], operating_systems: [] }),
    );
    const { data } = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch });
    expect(data.languages).toHaveLength(WakaTimeLimits.maxEntries);
    expect(data.languages.slice(0, 6).map((entry) => entry.name)).toEqual([
      "L00",
      "L01",
      "L02",
      "L03",
      "Z",
      "b",
    ]);
    expect(data.languages[6]).toEqual({ name: "L29", percent: 1, seconds: 29 });
  });

  test("names are plain one-line text, capped at 100 code points; empty names are dropped", async () => {
    const long = "😀".repeat(150);
    const stub = stubFetch(() =>
      stats({
        total_seconds: 5,
        daily_average: 1,
        human_readable_total: "  5\u0000 secs\n\t",
        languages: [
          { name: "Type\u0007Script\r\n  5", total_seconds: 3, percent: 60 },
          { name: long, total_seconds: 2, percent: 40 },
          { name: " \u0001 ", total_seconds: 1, percent: 1 },
          { name: "__proto__", total_seconds: 0, percent: 0 },
        ],
      }),
    );
    const { data } = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch });
    expect(data.humanReadableTotal).toBe("5 secs");
    expect(data.languages.map((entry) => entry.name)).toEqual([
      "TypeScript 5",
      `${"😀".repeat(99)}…`,
      "__proto__",
    ]);
    expect(data.editors).toEqual([]);
    expect(data.operatingSystems).toEqual([]);
  });

  test.each(WAKATIME_RANGES)("range %s asks for that range and is in the data", async (range) => {
    const stub = stubFetch(() => json(STATS));
    const { data } = await loadWakaTimeData({ apiKey: CANARY_KEY, range, fetch: stub.fetch });
    expect(stub.calls.map((call) => call.url)).toEqual([
      `https://wakatime.com/api/v1/users/current/stats/${range}`,
    ]);
    expect(data.range).toBe(range);
  });
});
