import { describe, expect, test } from "vitest";
import { GitHubDataError, loadGitHubData, type GitHubSourceOptions } from "../src/index.js";
import {
  exchange,
  fakeSleep,
  FIXTURE_LOGIN,
  replayFetch,
  successExchanges,
  type Exchange,
} from "./replayFetch.js";

const RESET_AT = "2026-10-14T10:00:00.000Z";

async function run(exchanges: readonly Exchange[], options: Partial<GitHubSourceOptions> = {}) {
  const replay = replayFetch(exchanges);
  const clock = fakeSleep();
  const outcome = await loadGitHubData({
    token: "test-token",
    login: FIXTURE_LOGIN,
    pageSize: 2,
    fetch: replay.fetch,
    sleep: clock.sleep,
    ...options,
  }).then(
    (result) => ({ result, error: undefined }),
    (error: unknown) => ({ result: undefined, error }),
  );
  expect(replay.failures).toEqual([]);
  return { ...outcome, replay, waits: clock.waits };
}

function asDataError(error: unknown): GitHubDataError {
  if (!(error instanceof GitHubDataError)) throw new Error("expected a GitHubDataError");
  return error;
}

describe("primary rate limit", () => {
  test("a 200 with a RATE_LIMITED error fails at once with the reset time", async () => {
    const { error, replay, waits } = await run([exchange("rate-limit-primary-graphql")]);
    const failure = asDataError(error);
    expect(failure.code).toBe("rate-limited");
    expect(failure.resetAt).toBe(RESET_AT);
    expect(failure.message).toContain(RESET_AT);
    expect(replay.requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  test("a 403 with no remaining requests fails at once with the reset time", async () => {
    const { error, replay, waits } = await run([exchange("rate-limit-primary-403")]);
    const failure = asDataError(error);
    expect(failure.code).toBe("rate-limited");
    expect(failure.status).toBe(403);
    expect(failure.resetAt).toBe(RESET_AT);
    expect(replay.requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  test("a 429 with no remaining requests is primary too", async () => {
    const primary429 = { ...exchange("rate-limit-primary-403"), status: 429 };
    const { error, waits } = await run([primary429]);
    expect(asDataError(error).code).toBe("rate-limited");
    expect(waits).toEqual([]);
  });
});

describe("secondary rate limit", () => {
  test("a 403 with retry-after waits that long and retries", async () => {
    const { result, replay, waits } = await run([
      exchange("rate-limit-secondary-403"),
      ...successExchanges(),
    ]);
    expect(waits).toEqual([2000]);
    expect(result?.data.login).toBe(FIXTURE_LOGIN);
    expect(result?.meta.requests).toBe(7);
    expect(replay.pending()).toBe(0);
  });

  test("a 429 without retry-after waits 60 seconds", async () => {
    const { result, waits } = await run([
      exchange("rate-limit-secondary-429"),
      ...successExchanges(),
    ]);
    expect(waits).toEqual([60_000]);
    expect(result?.data.login).toBe(FIXTURE_LOGIN);
  });

  test("a 403 naming the secondary limit without retry-after waits 60 seconds", async () => {
    const named = { ...exchange("rate-limit-secondary-429"), status: 403 };
    const { result, waits } = await run([named, ...successExchanges()]);
    expect(waits).toEqual([60_000]);
    expect(result?.data.login).toBe(FIXTURE_LOGIN);
  });

  test("a wait above maxRetryWaitSeconds fails at once", async () => {
    const { error, waits } = await run([exchange("rate-limit-secondary-403")], {
      maxRetryWaitSeconds: 1,
    });
    const failure = asDataError(error);
    expect(failure.code).toBe("secondary-rate-limited");
    expect(failure.retryAfterSeconds).toBe(2);
    expect(waits).toEqual([]);
  });

  test("gives up after three attempts", async () => {
    const limited = exchange("rate-limit-secondary-403");
    const { error, replay, waits } = await run([limited, limited, limited]);
    const failure = asDataError(error);
    expect(failure.code).toBe("secondary-rate-limited");
    expect(failure.retryAfterSeconds).toBe(2);
    expect(replay.requests).toHaveLength(3);
    expect(waits).toEqual([2000, 2000]);
  });
});

describe("other statuses", () => {
  test("a 502 is retried once after a second", async () => {
    const { result, waits } = await run([exchange("bad-gateway"), ...successExchanges()]);
    expect(waits).toEqual([1000]);
    expect(result?.meta.requests).toBe(7);
  });

  test("a second 502 fails as http", async () => {
    const gateway = exchange("bad-gateway");
    const { error, waits } = await run([gateway, gateway]);
    const failure = asDataError(error);
    expect(failure.code).toBe("http");
    expect(failure.status).toBe(502);
    expect(waits).toEqual([1000]);
  });

  test("a 401 is unauthorized and a plain 403 is forbidden", async () => {
    expect(asDataError((await run([exchange("unauthorized")])).error).code).toBe("unauthorized");
    expect(asDataError((await run([exchange("forbidden")])).error).code).toBe("forbidden");
  });

  test("meta reports the remaining requests from the response headers", async () => {
    const { result } = await run(successExchanges());
    expect(result?.meta.rateLimitRemaining).toBe(4993);
    expect(result?.meta.resetAt).toBe(RESET_AT);
  });
});
