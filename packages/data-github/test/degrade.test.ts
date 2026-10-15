import { describe, expect, test } from "vitest";
import {
  GitHubDataError,
  loadGitHubData,
  MemoryCache,
  type GitHubFetch,
  type GitHubSourceOptions,
} from "../src/index.js";
import { cacheKey } from "../src/cacheKey.js";
import {
  answering,
  fallbackExchanges,
  FALLBACK_IDS,
  weeksFor,
  weeksNode,
} from "./activityBodies.js";
import { item } from "./fixtureBodies.js";
import {
  exchange,
  FIXTURE_LOGIN,
  pageExchanges,
  replayFetch,
  successExchanges,
  type Exchange,
} from "./replayFetch.js";

const ACTIVITY_VARIABLES = exchange("activity").request.variables;
const WEEKS_VARIABLES = exchange("weeks").request.variables;

function load(
  exchanges: readonly Exchange[],
  cache?: MemoryCache,
  options: Partial<GitHubSourceOptions> = {},
) {
  const replay = replayFetch(exchanges);
  const result = loadGitHubData({
    token: "test-token",
    login: FIXTURE_LOGIN,
    pageSize: 2,
    fetch: replay.fetch,
    ...(cache === undefined ? {} : { cache }),
    ...options,
  });
  return { replay, result };
}

async function failure(promise: Promise<unknown>): Promise<GitHubDataError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof GitHubDataError)) throw new Error("expected a GitHubDataError");
  return error;
}

/** The activity request answered with `source` (a recorded error of any other operation). */
const asActivity = (source: Exchange) => answering(source, "ReadmintActivity", ACTIVITY_VARIABLES);
const asWeeks = (source: Exchange) => answering(source, "ReadmintWeeks", WEEKS_VARIABLES);

describe("a refused activity request", () => {
  test("keeps the load: no status, no pushes, the fallback pins, partial names it", async () => {
    const { replay, result } = load(fallbackExchanges(exchange("activity-forbidden")));
    const { data, meta } = await result;
    expect(replay.failures).toEqual([]);
    expect(replay.pending()).toBe(0);
    expect(meta.partial).toEqual(["activity"]);
    expect(data.status).toBeNull();
    expect(data.pushes).toEqual([]);
    expect(data.pinned.map((repository) => repository.nameWithOwner)).toEqual(
      FALLBACK_IDS.map((id) => `readmint-fixture/${id.slice(2)}`),
    );
    expect(item(data.pinned, 0).weeklyCommits).toHaveLength(52);
    expect(data.followers).toBe(42);
  });

  test.each([
    ["an HTTP 500", exchange("html-500")],
    ["an HTML 200", exchange("html-200")],
    ["a forbidden answer", exchange("forbidden")],
  ])("%s is a miss", async (_name, source) => {
    const { result } = load([
      ...pageExchanges(),
      asActivity(source),
      weeksFor(
        FALLBACK_IDS,
        FALLBACK_IDS.map((id) => weeksNode(id, 1)),
      ),
    ]);
    expect((await result).meta.partial).toEqual(["activity"]);
  });
});

describe("a refused weeks request", () => {
  test("keeps the load with null weekly commits and names the part", async () => {
    const exchanges = [...pageExchanges(), exchange("activity"), exchange("weeks-graphql-error")];
    const { replay, result } = load(exchanges);
    const { data, meta } = await result;
    expect(replay.failures).toEqual([]);
    expect(meta.partial).toEqual(["weeks"]);
    expect(data.pinned.map((repository) => repository.weeklyCommits)).toEqual([null, null]);
    expect(data.status?.emoji).toBe(":rocket:");
    expect(data.pushes).toHaveLength(5);
  });

  test("a node GitHub does not return as a repository has null counts, the others keep theirs", async () => {
    const exchanges = [...pageExchanges(), exchange("activity"), exchange("weeks-null-node")];
    const { data, meta } = await load(exchanges).result;
    expect(meta.partial).toEqual([]);
    expect(item(data.pinned, 0).weeklyCommits).toBeNull();
    expect(item(data.pinned, 1).weeklyCommits).toHaveLength(52);
  });

  test("an answer with the wrong number of nodes is a miss", async () => {
    const exchanges = [
      ...pageExchanges(),
      exchange("activity"),
      weeksFor(["R_site", "R_readmint"], [weeksNode("R_site", 1)]),
    ];
    const { data, meta } = await load(exchanges).result;
    expect(meta.partial).toEqual(["weeks"]);
    expect(data.pinned.every((repository) => repository.weeklyCommits === null)).toBe(true);
  });

  test("a node with another id than requested is a miss", async () => {
    const exchanges = [
      ...pageExchanges(),
      exchange("activity"),
      weeksFor(["R_site", "R_readmint"], [weeksNode("R_other", 1), weeksNode("R_readmint", 1)]),
    ];
    const { meta } = await load(exchanges).result;
    expect(meta.partial).toEqual(["weeks"]);
  });

  test("both parts can be missing at once", async () => {
    const weeks = { ...weeksFor(FALLBACK_IDS, []), body: exchange("weeks-graphql-error").body };
    const { data, meta } = await load([...pageExchanges(), exchange("activity-forbidden"), weeks])
      .result;
    expect(meta.partial).toEqual(["activity", "weeks"]);
    expect(data.pinned).toHaveLength(4);
    expect(data.pinned.every((repository) => repository.weeklyCommits === null)).toBe(true);
  });
});

describe("failures that still fail the load", () => {
  test.each([
    ["unauthorized", "unauthorized"],
    ["rate-limit-primary-403", "rate-limited"],
    ["rate-limit-primary-graphql", "rate-limited"],
  ])("%s on the activity request is %s", async (name, code) => {
    const { result } = load([...pageExchanges(), asActivity(exchange(name))]);
    expect((await failure(result)).code).toBe(code);
  });

  test.each([
    ["unauthorized", "unauthorized"],
    ["rate-limit-primary-403", "rate-limited"],
    ["rate-limit-primary-graphql", "rate-limited"],
  ])("%s on the weeks request is %s", async (name, code) => {
    const { result } = load([...pageExchanges(), exchange("activity"), asWeeks(exchange(name))]);
    expect((await failure(result)).code).toBe(code);
  });

  test("a secondary rate limit beyond the allowed wait fails the load", async () => {
    const { result } = load(
      [...pageExchanges(), asActivity(exchange("rate-limit-secondary-403"))],
      undefined,
      { maxRetryWaitSeconds: 0 },
    );
    const error = await failure(result);
    expect(error.code).toBe("secondary-rate-limited");
  });

  test.each(["ReadmintActivity", "ReadmintWeeks"])("a network failure of %s", async (operation) => {
    const replay = replayFetch(successExchanges());
    const failing: GitHubFetch = (url, init) => {
      const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
        operationName?: string;
      };
      if (sent.operationName === operation) {
        return Promise.reject(new TypeError("fetch failed"));
      }
      return replay.fetch(url, init);
    };
    const error = await failure(
      loadGitHubData({ token: "test-token", login: FIXTURE_LOGIN, pageSize: 2, fetch: failing }),
    );
    expect(error.code).toBe("network");
  });

  test.each(["ReadmintActivity", "ReadmintWeeks"])("an abort during %s", async (operation) => {
    const replay = replayFetch(successExchanges());
    const controller = new AbortController();
    const aborting: GitHubFetch = (url, init) => {
      const sent = JSON.parse(typeof init.body === "string" ? init.body : "{}") as {
        operationName?: string;
      };
      if (sent.operationName === operation) {
        controller.abort();
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return replay.fetch(url, init);
    };
    const error = await failure(
      loadGitHubData({
        token: "test-token",
        login: FIXTURE_LOGIN,
        pageSize: 2,
        fetch: aborting,
        signal: controller.signal,
      }),
    );
    expect(error.code).toBe("timeout");
  });
});

describe("caching a degraded load", () => {
  const key = () =>
    cacheKey({ viewer: FIXTURE_LOGIN, login: FIXTURE_LOGIN, pageSize: 2, maxRepositories: 300 });

  test("a load with a partial part is not written", async () => {
    const cache = new MemoryCache();
    const exchanges = [
      exchange("viewer"),
      ...pageExchanges(),
      exchange("activity"),
      exchange("weeks-graphql-error"),
    ];
    const { meta } = await load(exchanges, cache).result;
    expect(meta.partial).toEqual(["weeks"]);
    expect(await cache.get(await key())).toBeUndefined();
  });

  test("a complete load is written and read back with no partial part", async () => {
    const cache = new MemoryCache();
    const first = await load([exchange("viewer"), ...successExchanges()], cache).result;
    expect(first.meta.partial).toEqual([]);
    expect(await cache.get(await key())).toBeDefined();
    const second = await load([exchange("viewer")], cache).result;
    expect(second.meta).toMatchObject({ fromCache: true, partial: [] });
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
  });

  test("an entry of the format before the activity is a miss and is replaced", async () => {
    const cache = new MemoryCache();
    const first = await load([exchange("viewer"), ...successExchanges()], cache).result;
    const stored = JSON.parse((await cache.get(await key())) ?? "{}") as Record<string, unknown>;
    await cache.set(
      await key(),
      JSON.stringify({ profile: stored.profile, pages: stored.pages }),
      3600,
    );
    const { replay, result } = load([exchange("viewer"), ...successExchanges()], cache);
    const again = await result;
    expect(replay.failures).toEqual([]);
    expect(again.meta.fromCache).toBe(false);
    expect(JSON.stringify(again.data)).toBe(JSON.stringify(first.data));
    expect(JSON.parse((await cache.get(await key())) ?? "{}")).toHaveProperty("activity");
  });
});
