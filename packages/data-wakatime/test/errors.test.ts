import { describe, expect, test } from "vitest";
import { loadWakaTimeData, type WakaTimeSourceOptions } from "../src/index.js";
import {
  CANARY_KEY,
  failure,
  fakeSleep,
  fixture,
  json,
  stubFetch,
  type Stub,
} from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");

function load(stub: Stub, extra: Partial<WakaTimeSourceOptions> = {}) {
  return loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch, ...extra });
}

describe("HTTP statuses", () => {
  test.each([
    [401, "unauthorized", "WakaTime rejected the API key (HTTP 401)."],
    [
      402,
      "forbidden",
      "WakaTime refused the stats (HTTP 402); the account's plan may not cover this range.",
    ],
    [
      403,
      "forbidden",
      "WakaTime refused the stats (HTTP 403); the account's plan may not cover this range.",
    ],
    [404, "not-found", "WakaTime found no stats for this user and range (HTTP 404)."],
    [400, "invalid-response", "The WakaTime API answered HTTP 400."],
    [418, "invalid-response", "The WakaTime API answered HTTP 418."],
  ])("HTTP %i is %s after one request", async (status, code, message) => {
    const stub = stubFetch(() => json(`{"error":"${CANARY_KEY}"}`, status));
    const error = await failure(load(stub));
    expect([error.source, error.code, error.message]).toEqual(["wakatime", code, message]);
    expect(stub.calls).toHaveLength(1);
  });

  test("a 429 with Retry-After of at most 10 s is waited out once, then the answer is taken", async () => {
    const pause = fakeSleep();
    const stub = stubFetch(
      () => json("{}", 429, { "retry-after": "7" }),
      () => json(STATS),
    );
    const result = await load(stub, { sleep: pause.sleep });
    expect(pause.waits).toEqual([7000]);
    expect(result.meta.requests).toBe(2);
  });

  test("a 429 asking for more than 10 s fails at once naming the wait", async () => {
    const pause = fakeSleep();
    const stub = stubFetch(() => json("{}", 429, { "retry-after": "11" }));
    const error = await failure(load(stub, { sleep: pause.sleep }));
    expect([error.code, error.message]).toEqual([
      "rate-limited",
      "The WakaTime API rate limit was hit (HTTP 429); retry after 11 seconds.",
    ]);
    expect(pause.waits).toEqual([]);
    expect(stub.calls).toHaveLength(1);
  });

  test("a second 429 after the wait fails; a 429 without a usable Retry-After fails at once", async () => {
    const pause = fakeSleep();
    const twice = stubFetch(() => json("{}", 429, { "retry-after": "1" }));
    const error = await failure(load(twice, { sleep: pause.sleep }));
    expect(error.code).toBe("rate-limited");
    expect(twice.calls).toHaveLength(2);
    expect(pause.waits).toEqual([1000]);
    for (const header of [{}, { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }]) {
      const stub = stubFetch(() => json("{}", 429, header));
      const plain = await failure(load(stub, { sleep: pause.sleep }));
      expect(plain.message).toBe("The WakaTime API rate limit was hit (HTTP 429); retry later.");
      expect(stub.calls).toHaveLength(1);
    }
  });

  test.each([500, 502, 503, 504])(
    "HTTP %i is retried once after 1 s, then invalid-response",
    async (status) => {
      const pause = fakeSleep();
      const stub = stubFetch(() => json("{}", status));
      const error = await failure(load(stub, { sleep: pause.sleep }));
      expect([error.code, error.message]).toEqual([
        "invalid-response",
        `The WakaTime API answered HTTP ${String(status)}.`,
      ]);
      expect(stub.calls).toHaveLength(2);
      expect(pause.waits).toEqual([1000]);
    },
  );

  test("a 503 then a 200 is the data", async () => {
    const stub = stubFetch(
      () => json("{}", 503),
      () => json(STATS),
    );
    const result = await load(stub, { sleep: fakeSleep().sleep });
    expect(result.meta.requests).toBe(2);
    expect(result.data.totalSeconds).toBe(98766);
  });

  test.each([301, 302, 303, 307, 308])(
    "a %i redirect is refused after one request, the target never asked",
    async (status) => {
      const stub = stubFetch(
        () => new Response(null, { status, headers: { location: "https://evil.example/steal" } }),
      );
      const error = await failure(load(stub));
      expect([error.code, error.message]).toEqual([
        "invalid-response",
        "The WakaTime API redirected; no redirect is followed.",
      ]);
      expect(stub.calls.map((call) => call.url)).toEqual([
        "https://wakatime.com/api/v1/users/current/stats/last_7_days",
      ]);
      expect(stub.calls[0]?.init.redirect).toBe("manual");
    },
  );
});

describe("bodies", () => {
  test("an HTML answer is refused by its type", async () => {
    const stub = stubFetch(
      () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
    );
    const error = await failure(load(stub));
    expect([error.code, error.message]).toEqual([
      "invalid-response",
      'The WakaTime answer has content type "text/html", not JSON.',
    ]);
  });

  test.each([
    ["{", "is not valid JSON"],
    ["[]", "has no data object"],
    ['{"data":[]}', "has no data object"],
    ['{"error":"x"}', "has no data object"],
  ])("body %s: The WakaTime answer %s.", async (body, why) => {
    const error = await failure(load(stubFetch(() => json(body))));
    expect([error.code, error.message]).toEqual([
      "invalid-response",
      `The WakaTime answer ${why}.`,
    ]);
  });

  test.each([
    [{ total_seconds: null, daily_average: 1 }, "total_seconds is not a non-negative number"],
    [{ total_seconds: -1, daily_average: 1 }, "total_seconds is not a non-negative number"],
    [{ total_seconds: "5", daily_average: 1 }, "total_seconds is not a non-negative number"],
    [{ total_seconds: 5 }, "daily_average is not a non-negative number"],
    [
      { total_seconds: 5, daily_average: 1, human_readable_total: 5 },
      "human_readable_total is not text",
    ],
    [{ total_seconds: 5, daily_average: 1, languages: {} }, "languages is not a list"],
    [{ total_seconds: 5, daily_average: 1, editors: [1] }, "an entry of editors is not an object"],
    [
      { total_seconds: 5, daily_average: 1, languages: [{ total_seconds: 1, percent: 1 }] },
      "an entry of languages has no name",
    ],
    [
      {
        total_seconds: 5,
        daily_average: 1,
        operating_systems: [{ name: "x", total_seconds: -2, percent: 1 }],
      },
      "operating_systems seconds is not a non-negative number",
    ],
    [
      {
        total_seconds: 5,
        daily_average: 1,
        languages: [{ name: "x", total_seconds: 2, percent: null }],
      },
      "languages percent is not a non-negative number",
    ],
  ])("data %j is invalid-response", async (data, why) => {
    const stub = stubFetch(() => json(JSON.stringify({ data })));
    const error = await failure(load(stub));
    expect([error.code, error.message]).toEqual([
      "invalid-response",
      `The WakaTime answer ${why}.`,
    ]);
  });

  test("a body over maxBytes is too-large, by its length header or by counting", async () => {
    const declared = stubFetch(() => json(STATS, 200, { "content-length": "5000" }));
    const error = await failure(load(declared, { maxBytes: 100 }));
    expect([error.code, error.message]).toEqual([
      "too-large",
      "The WakaTime answer is larger than 100 bytes.",
    ]);
    const streamed = stubFetch(() => {
      const bytes = new TextEncoder().encode(STATS);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return new Response(body, { headers: { "content-type": "application/json" } });
    });
    expect((await failure(load(streamed, { maxBytes: 100 }))).code).toBe("too-large");
  });
});

describe("transport", () => {
  test("a fetch that never answers times out within timeoutMs", async () => {
    const stub = stubFetch(() => new Promise<Response>(() => undefined));
    const started = performance.now();
    const error = await failure(load(stub, { timeoutMs: 1000 }));
    expect([error.code, error.message]).toEqual([
      "timeout",
      "The WakaTime request timed out or was aborted.",
    ]);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  test("the timeout covers a retry wait too", async () => {
    const stub = stubFetch(() => json("{}", 429, { "retry-after": "10" }));
    const never = () => new Promise<void>(() => undefined);
    const error = await failure(load(stub, { timeoutMs: 1000, sleep: never }));
    expect(error.code).toBe("timeout");
    expect(stub.calls).toHaveLength(1);
  });

  test("an aborted signal stops the load before any request", async () => {
    const stub = stubFetch(() => json(STATS));
    const error = await failure(load(stub, { signal: AbortSignal.abort() }));
    expect(error.code).toBe("timeout");
    expect(stub.calls).toHaveLength(0);
  });

  test("a network failure is network, without the cause's text", async () => {
    const stub = stubFetch(() =>
      Promise.reject(new TypeError(`connect ECONNREFUSED wakatime.com ${CANARY_KEY}`)),
    );
    const error = await failure(load(stub));
    expect([error.code, error.message]).toEqual([
      "network",
      "The WakaTime API could not be reached.",
    ]);
    expect(error.cause).toBeUndefined();
  });

  test("a foreign error inside the load becomes a fixed invalid-response", async () => {
    const stub = stubFetch(() => {
      const response = json(STATS);
      Object.defineProperty(response, "headers", {
        get() {
          throw new Error(`boom ${CANARY_KEY}`);
        },
      });
      return response;
    });
    const error = await failure(load(stub));
    expect([error.code, error.message]).toEqual(["invalid-response", "The WakaTime load failed."]);
  });
});
