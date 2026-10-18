import { describe, expect, test } from "vitest";
import { loadWakaTimeData, type WakaTimeSourceOptions } from "../src/index.js";
import { CANARY_KEY, failure, fixture, json, stubFetch } from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");

async function refused(options: Partial<WakaTimeSourceOptions>) {
  const stub = stubFetch(() => json(STATS));
  const error = await failure(
    loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch, ...options }),
  );
  expect(stub.calls).toHaveLength(0);
  return error;
}

describe("options are checked before any request", () => {
  test.each(["", "   ", "\n"])("the key %j is missing-token", async (apiKey) => {
    const error = await refused({ apiKey });
    expect([error.code, error.message]).toEqual([
      "missing-token",
      "The WakaTime API key is empty.",
    ]);
  });

  test.each([`${CANARY_KEY}\r\nx: y`, "a\nb", "key with space", "kéy", "a\u0000b"])(
    "the key %j is invalid-option",
    async (apiKey) => {
      const error = await refused({ apiKey });
      expect([error.code, error.message]).toEqual([
        "invalid-option",
        "The WakaTime API key must be printable ASCII without spaces.",
      ]);
    },
  );

  test("a key of another type is missing-token", async () => {
    const error = await refused({ apiKey: 5 as unknown as string });
    expect(error.code).toBe("missing-token");
  });

  test.each(["last_week", "LAST_7_DAYS", "2026", "last_7_days/../x", ""])(
    "range %j is invalid-option",
    async (range) => {
      const error = await refused({ range });
      expect([error.code, error.message]).toEqual([
        "invalid-option",
        "range must be one of last_7_days, last_30_days, last_6_months, last_year, all_time.",
      ]);
    },
  );

  test.each(["", "Waka", "a-b", "1a", "x".repeat(33)])(
    "namespace %j is invalid-option",
    async (namespace) => {
      const error = await refused({ namespace });
      expect([error.source, error.code]).toEqual(["wakatime", "invalid-option"]);
    },
  );

  test.each([
    [{ maxBytes: 0 }, "maxBytes must be an integer from 1 to 8388608."],
    [{ maxBytes: 8 * 1024 * 1024 + 1 }, "maxBytes must be an integer from 1 to 8388608."],
    [{ timeoutMs: 999 }, "timeoutMs must be an integer from 1000 to 60000."],
    [{ timeoutMs: 1.5 }, "timeoutMs must be an integer from 1000 to 60000."],
    [{ cacheTtlSeconds: 0 }, "cacheTtlSeconds must be an integer from 1 to 604800."],
  ])("%j is invalid-option", async (options, message) => {
    const error = await refused(options);
    expect([error.code, error.message]).toEqual(["invalid-option", message]);
  });
});
