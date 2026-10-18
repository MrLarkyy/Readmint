import { MemoryCache } from "@readmint/data";
import { describe, expect, test } from "vitest";
import { loadWakaTimeData } from "../src/index.js";
import { CANARY_KEY, fixture, json, stats, stubFetch } from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");
const EMPTY = {
  version: 0,
  range: "last_7_days",
  totalSeconds: 0,
  humanReadableTotal: "",
  dailyAverageSeconds: 0,
  languages: [],
  editors: [],
  operatingSystems: [],
};

describe("WakaTime still calculating", () => {
  test("a 202 with stats is partial data, not a failure", async () => {
    const stub = stubFetch(() =>
      stats(
        {
          total_seconds: 600.4,
          human_readable_total: "10 mins",
          is_up_to_date: false,
          languages: [{ name: "Go", total_seconds: 600.4, percent: 100 }],
        },
        202,
      ),
    );
    const result = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch });
    expect(result.meta).toEqual({ requests: 1, fromCache: false, partial: true });
    expect(result.data).toEqual({
      ...EMPTY,
      totalSeconds: 600,
      humanReadableTotal: "10 mins",
      languages: [{ name: "Go", percent: 100, seconds: 600 }],
    });
  });

  test.each([
    ["no body", () => new Response(null, { status: 202 })],
    ["an empty JSON body", () => json("", 202)],
    ["a body without data", () => json('{"message":"calculating"}', 202)],
    ["data that is not an object", () => json('{"data":null}', 202)],
  ])("a 202 with %s is the empty data object, partial", async (_name, answer) => {
    const result = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stubFetch(answer).fetch });
    expect(result.data).toEqual(EMPTY);
    expect(result.meta.partial).toBe(true);
  });

  test("a 200 that is not up to date is partial, its data kept", async () => {
    const body = JSON.parse(STATS) as { data: Record<string, unknown> };
    body.data["is_up_to_date"] = false;
    const stub = stubFetch(() => json(JSON.stringify(body)));
    const result = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch });
    expect(result.meta.partial).toBe(true);
    expect(result.data.totalSeconds).toBe(98766);
  });

  test("a partial answer is never cached: the next load asks again", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(
      () => new Response(null, { status: 202 }),
      () => json(STATS),
    );
    const first = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch, cache });
    const second = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch, cache });
    const third = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch, cache });
    expect([first.meta.partial, second.meta.partial, third.meta.partial]).toEqual([
      true,
      false,
      false,
    ]);
    expect(third.meta.fromCache).toBe(true);
    expect(stub.calls).toHaveLength(2);
  });

  test("a 202 body that is not JSON is still refused", async () => {
    const stub = stubFetch(
      () =>
        new Response("<html>wait</html>", {
          status: 202,
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch })).rejects.toMatchObject(
      {
        code: "invalid-response",
        message: 'The WakaTime answer has content type "text/html", not JSON.',
      },
    );
  });
});
