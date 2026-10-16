import { inspect } from "node:util";
import { describe, expect, test } from "vitest";
import {
  GitHubDataError,
  loadGitHubData,
  MemoryCache,
  type GitHubCache,
  type GitHubFetch,
} from "../src/index.js";
import { answering, FALLBACK_IDS, weeksFor, weeksNode } from "./activityBodies.js";
import {
  exchange,
  fakeSleep,
  FIXTURE_LOGIN,
  pageExchanges,
  replayFetch,
  successExchanges,
  type Exchange,
  type Replay,
} from "./replayFetch.js";
import { withBody, withUser } from "./fixtureBodies.js";

const CANARY = "ghp_CANARY0123456789abcdefCANARY0123456789";

class RecordingCache implements GitHubCache {
  readonly keys: string[] = [];
  readonly values: string[] = [];
  private readonly inner = new MemoryCache();

  get(key: string): Promise<string | undefined> {
    this.keys.push(key);
    return this.inner.get(key);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.keys.push(key);
    this.values.push(value);
    return this.inner.set(key, value, ttlSeconds);
  }
}

interface Scenario {
  readonly name: string;
  readonly exchanges: readonly Exchange[];
  readonly viewer?: boolean;
}

const echoingError = (message: string): Exchange =>
  withBody(exchange("profile"), (body) => {
    body.errors = [{ type: "INTERNAL", message }];
  });

const activityAnswer = (source: Exchange) =>
  answering(source, "ReadmintActivity", exchange("activity").request.variables);
const weeksAnswer = (source: Exchange) =>
  answering(source, "ReadmintWeeks", exchange("weeks").request.variables);

const scenarios: Scenario[] = [
  {
    name: "activity error echoing the token",
    exchanges: [
      ...pageExchanges(),
      activityAnswer(echoingError(`bad token ${CANARY}`)),
      weeksFor(
        FALLBACK_IDS,
        FALLBACK_IDS.map((id) => weeksNode(id, 1)),
      ),
    ],
  },
  {
    name: "weeks error echoing the token",
    exchanges: [
      ...pageExchanges(),
      exchange("activity"),
      weeksAnswer(echoingError(`bad token ${CANARY}`)),
    ],
  },
  {
    name: "invalid weeks value",
    exchanges: [
      ...pageExchanges(),
      exchange("activity"),
      weeksFor(["R_site", "R_readmint"], [CANARY, CANARY]),
    ],
  },
  {
    name: "unauthorized on the activity request",
    exchanges: [...pageExchanges(), activityAnswer(exchange("unauthorized"))],
  },
  { name: "success", exchanges: successExchanges() },
  {
    name: "success in viewer mode",
    exchanges: [exchange("viewer"), ...successExchanges()],
    viewer: true,
  },
  { name: "unauthorized", exchanges: [exchange("unauthorized")] },
  { name: "forbidden", exchanges: [exchange("forbidden")] },
  { name: "primary limit 403", exchanges: [exchange("rate-limit-primary-403")] },
  { name: "primary limit graphql", exchanges: [exchange("rate-limit-primary-graphql")] },
  {
    name: "secondary limit exhausted",
    exchanges: Array.from({ length: 3 }, () => exchange("rate-limit-secondary-403")),
  },
  { name: "html 500", exchanges: [exchange("html-500")] },
  { name: "html 200", exchanges: [exchange("html-200")] },
  { name: "bad gateway twice", exchanges: [exchange("bad-gateway"), exchange("bad-gateway")] },
  { name: "partial errors", exchanges: [exchange("graphql-partial-errors")] },
  {
    name: "user not found",
    exchanges: [
      withBody(exchange("profile"), (body) => {
        if (body.data) body.data.user = null;
      }),
    ],
  },
  {
    name: "invalid response",
    exchanges: [
      withUser(exchange("profile"), (user) => {
        user.followers.totalCount = CANARY;
      }),
    ],
  },
  { name: "graphql error echoing the token", exchanges: [echoingError(`bad token ${CANARY}`)] },
  {
    name: "graphql error echoing the token at the length cap",
    exchanges: [echoingError(`${"x".repeat(190)}${CANARY}`)],
  },
];

// Every attempt passes a cache, so the loader resolves the viewer first even with a login.
function viewerFirst(exchanges: readonly Exchange[]): Exchange[] {
  return [exchange("viewer"), ...exchanges];
}

async function attempt(replayOrFetch: Replay | GitHubFetch, viewer = false) {
  const cache = new RecordingCache();
  const fetch = typeof replayOrFetch === "function" ? replayOrFetch : replayOrFetch.fetch;
  const outcome = await loadGitHubData({
    token: CANARY,
    ...(viewer ? {} : { login: FIXTURE_LOGIN }),
    pageSize: 2,
    cache,
    fetch,
    sleep: fakeSleep().sleep,
  }).then(
    (result) => ({ result, error: undefined as unknown }),
    (error: unknown) => ({ result: undefined, error }),
  );
  return { ...outcome, cache };
}

function expectNoCanary(text: string, where: string): void {
  expect(text.includes(CANARY), where).toBe(false);
  expect(text.includes("ghp_CANARY"), `${where} (fragment)`).toBe(false);
}

function expectErrorClean(error: unknown): void {
  if (error === undefined) return;
  expect(error).toBeInstanceOf(GitHubDataError);
  const failure = error as GitHubDataError;
  expectNoCanary(failure.message, "message");
  expectNoCanary(failure.stack ?? "", "stack");
  expectNoCanary(String(failure), "String(error)");
  expectNoCanary(JSON.stringify(failure), "JSON.stringify(error)");
  expectNoCanary(inspect(failure, { depth: null, showHidden: true }), "inspect(error)");
  expect(failure.cause).toBeUndefined();
}

describe("the token never leaves the Authorization header", () => {
  test.each(scenarios)("$name", async ({ exchanges, viewer }) => {
    const replay = replayFetch(viewer ? exchanges : viewerFirst(exchanges));
    const { result, error, cache } = await attempt(replay, viewer);
    expect(replay.failures).toEqual([]);
    expectErrorClean(error);
    if (result !== undefined) {
      expectNoCanary(JSON.stringify(result.data), "data");
      expectNoCanary(JSON.stringify(result.meta), "meta");
      expectNoCanary(inspect(result, { depth: null, showHidden: true }), "inspect(result)");
    }
    for (const text of [...cache.keys, ...cache.values]) expectNoCanary(text, "cache");
    expect(replay.requests.length).toBeGreaterThan(0);
    for (const request of replay.requests) {
      expectNoCanary(request.url, "url");
      expectNoCanary(request.body, "body");
      const carrying = Object.entries(request.headers)
        .filter(([, value]) => value.includes(CANARY))
        .map(([name]) => name);
      expect(carrying).toEqual(["authorization"]);
      expect(request.headers.authorization).toBe(`bearer ${CANARY}`);
    }
  });

  test("a GraphQL error message that echoes the token comes out redacted", async () => {
    const { error } = await attempt(
      replayFetch(viewerFirst([echoingError(`bad token ${CANARY} here`)])),
    );
    expect((error as GitHubDataError).code).toBe("graphql");
    expect((error as GitHubDataError).message).toContain("bad token *** here");
  });

  test("other token-shaped strings in a GitHub message are redacted too", async () => {
    const other = "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz";
    const { error } = await attempt(replayFetch(viewerFirst([echoingError(`leaked ${other}`)])));
    expect((error as GitHubDataError).message).not.toContain(other);
    expect((error as GitHubDataError).message).toContain("leaked ***");
  });

  test("a fetch error that quotes the token is not passed on", async () => {
    const failing: GitHubFetch = () =>
      Promise.reject(
        new TypeError(`fetch failed for ${CANARY}`, {
          cause: Object.assign(new Error(`socket ${CANARY}`), { code: "ECONNRESET" }),
        }),
      );
    const { error } = await attempt(failing);
    expectErrorClean(error);
    expect((error as GitHubDataError).code).toBe("network");
    expect((error as GitHubDataError).causeCode).toBe("ECONNRESET");
  });

  test("a token with CR/LF is rejected without echoing it and without a request", async () => {
    const replay = replayFetch([]);
    const error: unknown = await loadGitHubData({
      token: `${CANARY}\r\nx-injected: 1`,
      login: FIXTURE_LOGIN,
      fetch: replay.fetch,
    }).catch((reason: unknown) => reason);
    expectErrorClean(error);
    expect((error as GitHubDataError).code).toBe("invalid-option");
    expect(replay.requests).toEqual([]);
  });
});
