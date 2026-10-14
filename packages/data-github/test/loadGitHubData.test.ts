import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { GitHubDataError, loadGitHubData, type GitHubSourceOptions } from "../src/index.js";
import { item, withBody, withCalendar, withRepositories } from "./fixtureBodies.js";
import {
  exchange,
  FIXTURE_LOGIN,
  replayFetch,
  sentVariables,
  successExchanges,
  type Exchange,
  type Replay,
} from "./replayFetch.js";

const expectedText = readFileSync(
  new URL("./fixtures/expected-github-data.json", import.meta.url),
  "utf8",
);
const CURSOR_1 = "Y3Vyc29yOnYyOpK5MjA=";
const CURSOR_2 = "Y3Vyc29yOnYyOpK0MjA=";

function load(replay: Replay, options: Partial<GitHubSourceOptions> = {}) {
  return loadGitHubData({
    token: "test-token",
    login: FIXTURE_LOGIN,
    pageSize: 2,
    fetch: replay.fetch,
    ...options,
  });
}

async function loadError(
  exchanges: readonly Exchange[],
  options: Partial<GitHubSourceOptions> = {},
): Promise<GitHubDataError> {
  const error: unknown = await load(replayFetch(exchanges), options).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof GitHubDataError)) throw new Error("expected a GitHubDataError");
  return error;
}

function expectReplayDone(replay: Replay): void {
  expect(replay.failures).toEqual([]);
  expect(replay.pending()).toBe(0);
}

describe("loadGitHubData", () => {
  test("builds exactly the expected data object from the recorded responses", async () => {
    const replay = replayFetch(successExchanges());
    const result = await load(replay);
    expectReplayDone(replay);
    expect(JSON.stringify(result.data)).toBe(JSON.stringify(JSON.parse(expectedText)));
    expect(result.meta).toEqual({
      requests: 4,
      cost: 4,
      rateLimitRemaining: 4995,
      resetAt: "2026-10-14T10:00:00.000Z",
      fromCache: false,
    });
  });

  test("resolves the token's owner first in viewer mode", async () => {
    const replay = replayFetch([exchange("viewer"), ...successExchanges()]);
    const result = await loadGitHubData({ token: "test-token", pageSize: 2, fetch: replay.fetch });
    expectReplayDone(replay);
    expect(JSON.stringify(result.data)).toBe(JSON.stringify(JSON.parse(expectedText)));
    expect(result.meta.requests).toBe(5);
    expect(result.meta.cost).toBe(5);
    expect(sentVariables(item(replay.requests, 0))).toEqual({});
    expect(sentVariables(item(replay.requests, 1))).toEqual({ login: FIXTURE_LOGIN });
  });

  test("follows the page cursors and sends the login only as a variable", async () => {
    const replay = replayFetch(successExchanges());
    await load(replay);
    expectReplayDone(replay);
    expect(replay.requests.slice(1).map(sentVariables)).toEqual([
      { login: FIXTURE_LOGIN, first: 2, after: null },
      { login: FIXTURE_LOGIN, first: 2, after: CURSOR_1 },
      { login: FIXTURE_LOGIN, first: 2, after: CURSOR_2 },
    ]);
    for (const request of replay.requests) {
      const { query } = JSON.parse(request.body) as { query: string };
      expect(query).not.toContain(FIXTURE_LOGIN);
      expect(request.url).toBe("https://api.github.com/graphql");
      expect(request.method).toBe("POST");
    }
  });

  test("stops at maxRepositories and reports the truncation", async () => {
    const replay = replayFetch(successExchanges().slice(0, 3));
    const { data } = await load(replay, { maxRepositories: 3 });
    expectReplayDone(replay);
    expect(data.repositories.map((repository) => repository.name)).toEqual([
      "readmint",
      "dotfiles",
      "forked-lib",
    ]);
    expect(data.repositoriesTruncated).toBe(true);
    expect(data.counts.repositories).toBe(5);
  });

  test("reports truncation when the cap ends on a page boundary with more pages left", async () => {
    const replay = replayFetch(successExchanges().slice(0, 3));
    const { data } = await load(replay, { maxRepositories: 4 });
    expectReplayDone(replay);
    expect(data.repositories).toHaveLength(4);
    expect(data.repositoriesTruncated).toBe(true);
  });

  test("fails on a next page without a cursor instead of looping", async () => {
    const broken = withRepositories(exchange("repositories-1"), (connection) => {
      connection.pageInfo.endCursor = null;
    });
    const error = await loadError([exchange("profile"), broken]);
    expect(error.code).toBe("invalid-response");
  });

  test("fails on a repeated cursor instead of looping", async () => {
    const repeating = withRepositories(exchange("repositories-2"), (connection) => {
      connection.pageInfo.endCursor = CURSOR_1;
    });
    const error = await loadError([exchange("profile"), exchange("repositories-1"), repeating]);
    expect(error.code).toBe("invalid-response");
  });

  test("a null user is not-found", async () => {
    const missing = withBody(exchange("profile"), (body) => {
      if (body.data) body.data.user = null;
    });
    expect((await loadError([missing])).code).toBe("not-found");
  });

  test("GitHub's NOT_FOUND error is not-found", async () => {
    const error = await loadError([exchange("user-not-found")], { login: "nobody-here" });
    expect(error.code).toBe("not-found");
  });

  test("an empty account gives empty lists and zero streaks", async () => {
    const profile = withCalendar(exchange("profile"), (calendar) => {
      calendar.totalContributions = 0;
      for (const week of calendar.weeks) {
        for (const day of week.contributionDays) {
          day.contributionCount = 0;
          day.contributionLevel = "NONE";
        }
      }
    });
    const page = withRepositories(exchange("repositories-1"), (connection) => {
      connection.totalCount = 0;
      connection.pageInfo = { hasNextPage: false, endCursor: null };
      connection.nodes = [];
    });
    const replay = replayFetch([profile, page]);
    const { data } = await load(replay);
    expectReplayDone(replay);
    expect(data.repositories).toEqual([]);
    expect(data.languages).toEqual([]);
    expect(data.counts).toEqual({ repositories: 0, stars: 0, forks: 0 });
    expect(data.repositoriesTruncated).toBe(false);
    expect(data.contributions.total).toBe(0);
    expect(data.contributions.streaks).toEqual({
      current: { length: 0, start: null, end: null },
      longest: { length: 0, start: null, end: null },
    });
  });

  test("rejects out-of-range options before any request", async () => {
    const replay = replayFetch([]);
    for (const options of [
      { pageSize: 0 },
      { pageSize: 101 },
      { maxRepositories: 1001 },
      { requestTimeoutMs: 10 },
      { maxRetryWaitSeconds: 901 },
      { cacheTtlSeconds: 0 },
      { pageSize: 1.5 },
      { login: "-bad" },
      { login: "a".repeat(40) },
    ]) {
      await expect(load(replay, options)).rejects.toMatchObject({ code: "invalid-option" });
    }
    await expect(load(replay, { token: "" })).rejects.toMatchObject({ code: "missing-token" });
    await expect(load(replay, { token: "   " })).rejects.toMatchObject({ code: "missing-token" });
    expect(replay.requests).toEqual([]);
  });
});
