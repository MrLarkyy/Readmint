import { describe, expect, test } from "vitest";
import {
  GitHubDataError,
  loadGitHubData,
  MemoryCache,
  type GitHubCache,
  type GitHubSourceOptions,
} from "../src/index.js";
import {
  authoredExchanges,
  authoredScenario,
  commitExchange,
  contributedExchange,
  historyExchange,
  oid,
  viewerExchange,
} from "./authoredBodies.js";
import { withBody } from "./fixtureBodies.js";
import { FIXTURE_LOGIN, replayFetch, successExchanges, type Exchange } from "./replayFetch.js";

const CANARY = "ghp_CANARY0123456789abcdefCANARY0123456789";

function viewerOf(login: string): Exchange {
  return withBody(viewerExchange(), (body) => {
    body.data = { ...body.data, viewer: { login } };
  });
}

const base = {
  login: FIXTURE_LOGIN,
  pageSize: 2,
  languageCommitCap: 10,
  excludeRepositories: ["skipped"],
};

function run(exchanges: readonly Exchange[], options: Partial<GitHubSourceOptions> = {}) {
  const replay = replayFetch(exchanges);
  return loadGitHubData({ token: CANARY, ...base, fetch: replay.fetch, ...options }).then(
    (result) => ({ result, replay }),
  );
}

const gets = <T extends { method: string }>(requests: readonly T[]): T[] =>
  requests.filter((request) => request.method === "GET");

describe("languagesAuthored", () => {
  test("repository bytes lead with TypeScript, the user's own additions with Kotlin", async () => {
    const { result, replay } = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    expect(replay.failures).toEqual([]);
    expect(replay.pending()).toBe(0);
    expect(result.data.languages[0]?.name).toBe("TypeScript");
    expect(result.data.languagesAuthored).toEqual([
      { name: "Kotlin", color: "#A97BFF", share: 240 / 270, additions: 240 },
      { name: "Java", color: "#b07219", share: 20 / 270, additions: 20 },
      { name: "TypeScript", color: "#3178c6", share: 10 / 270, additions: 10 },
    ]);
    expect(result.meta.partial).toEqual([]);
    expect(gets(replay.requests)).toHaveLength(4);
    // viewer, profile, 3 pages, activity, weeks, contributed, history, 4 commits
    expect(result.meta.requests).toBe(13);
  });

  test("the same input gives the same bytes", async () => {
    const first = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    const second = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    expect(JSON.stringify(first.result.data)).toBe(JSON.stringify(second.result.data));
  });

  test("requests are authorised GETs to the fixed host", async () => {
    const { replay } = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    for (const request of gets(replay.requests)) {
      expect(request.url).toMatch(
        /^https:\/\/api\.github\.com\/repos\/readmint-fixture\/[a-z]+\/commits\/[0-9a-f]{40}$/,
      );
      expect(request.headers.authorization).toBe(`bearer ${CANARY}`);
      expect(request.body).toBe("");
    }
  });

  test("a cap of 0 sends no extra request and leaves the field empty", async () => {
    const { result, replay } = await run(successExchanges(), { languageCommitCap: 0 });
    expect(replay.failures).toEqual([]);
    expect(result.data.languagesAuthored).toEqual([]);
    expect(result.meta.requests).toBe(6);
  });

  test("merge commits, forks and excluded repositories add nothing", async () => {
    const { replay } = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    expect(replay.failures).toEqual([]);
    const history = replay.requests.find((request) =>
      request.body.includes("ReadmintAuthoredHistory"),
    );
    expect(JSON.parse(history?.body ?? "{}")).toMatchObject({
      variables: { ids: ["R_app", "R_mono"] },
    });
    const urls = gets(replay.requests).map((request) => request.url);
    expect(urls.some((url) => url.includes(oid(4)))).toBe(false);
  });

  test("a cap below the commit count reads that many and reports authored-cap", async () => {
    const scenario = authoredScenario();
    const { result, replay } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), scenario.commits.slice(0, 3)),
      { languageCommitCap: 3 },
    );
    expect(replay.failures).toEqual([]);
    expect(gets(replay.requests)).toHaveLength(3);
    expect(result.meta.partial).toEqual(["authored-cap"]);
    expect(result.data.languagesAuthored.map((entry) => entry.additions)).toEqual([180, 20, 10]);
  });

  test("a primary rate limit at the third commit keeps what was counted and warns", async () => {
    const scenario = authoredScenario();
    const limited = commitExchange("readmint-fixture/app", oid(3), [], {
      status: 403,
      remaining: 0,
      body: { message: `API rate limit exceeded ${CANARY}` },
    });
    const { result, replay } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [
        scenario.commits[0] as Exchange,
        scenario.commits[1] as Exchange,
        limited,
      ]),
    );
    expect(replay.failures).toEqual([]);
    expect(gets(replay.requests)).toHaveLength(3);
    expect(result.meta.partial).toEqual(["authored"]);
    expect(result.data.languagesAuthored.map((entry) => entry.name)).toEqual([
      "Kotlin",
      "TypeScript",
    ]);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });

  test("fewer than 100 REST requests left stops the reading", async () => {
    const scenario = authoredScenario();
    const low = commitExchange("readmint-fixture/app", oid(1), [["src/Main.kt", 100]], {
      remaining: 99,
    });
    const { result, replay } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [low, scenario.commits[1] as Exchange]),
    );
    expect(gets(replay.requests)).toHaveLength(1);
    expect(result.meta.partial).toEqual(["authored"]);
    expect(result.data.languagesAuthored).toHaveLength(1);
  });

  test("exactly 100 left still reads on", async () => {
    const scenario = authoredScenario();
    const edge = commitExchange("readmint-fixture/app", oid(1), [["src/Main.kt", 100]], {
      remaining: 100,
    });
    const { result } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [edge, ...scenario.commits.slice(1)]),
    );
    expect(result.meta.partial).toEqual([]);
  });

  test("a commit GitHub cannot return is skipped, not fatal", async () => {
    const scenario = authoredScenario();
    const missing = commitExchange("readmint-fixture/monolith", oid(2), [], {
      status: 404,
      body: {},
    });
    const { result } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [
        scenario.commits[0] as Exchange,
        missing,
        scenario.commits[2] as Exchange,
        scenario.commits[3] as Exchange,
      ]),
    );
    expect(result.meta.partial).toEqual([]);
    expect(result.data.languagesAuthored.map((entry) => entry.name)).toEqual(["Kotlin", "Java"]);
  });

  test("a malformed commit body is skipped, not fatal", async () => {
    const scenario = authoredScenario();
    const odd = commitExchange("readmint-fixture/monolith", oid(2), [], { body: { files: 7 } });
    const { result } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [
        scenario.commits[0] as Exchange,
        odd,
        scenario.commits[2] as Exchange,
        scenario.commits[3] as Exchange,
      ]),
    );
    expect(result.meta.partial).toEqual([]);
    expect(result.data.languagesAuthored.map((entry) => entry.name)).toEqual(["Kotlin", "Java"]);
  });

  test("a network failure on a commit is a partial load", async () => {
    const scenario = authoredScenario();
    const { result } = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [scenario.commits[0] as Exchange]),
    );
    expect(result.meta.partial).toEqual(["authored"]);
    expect(result.data.languagesAuthored).toHaveLength(1);
  });

  test("a rejected token on a commit fails the load", async () => {
    const scenario = authoredScenario();
    const denied = commitExchange("readmint-fixture/app", oid(1), [], { status: 401, body: {} });
    await expect(
      run(authoredExchanges(viewerOf(FIXTURE_LOGIN), [denied, scenario.commits[1] as Exchange])),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  test("an aborted signal fails the load instead of returning a partial one", async () => {
    const controller = new AbortController();
    const replay = replayFetch(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    const error: unknown = await loadGitHubData({
      token: CANARY,
      ...base,
      fetch: (url, init) => {
        if (init.method === "GET") controller.abort();
        return replay.fetch(url, init);
      },
      signal: controller.signal,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GitHubDataError);
    expect((error as GitHubDataError).code).toBe("timeout");
  });

  test("a stored entry, a key and the result hold no token", async () => {
    const stored: string[] = [];
    const inner = new MemoryCache();
    const cache: GitHubCache = {
      get: (key) => inner.get(key),
      set: (key, value, ttl) => {
        stored.push(key, value);
        return inner.set(key, value, ttl);
      },
    };
    const { replay, result } = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)), { cache });
    const texts = [...stored, JSON.stringify(result), ...replay.requests.map((r) => r.url)];
    for (const text of texts) expect(text).not.toContain(CANARY);
    // four commits and the main entry, each a key and a value
    expect(stored).toHaveLength(10);
  });
});

describe("privacy", () => {
  const privateScenario = () => {
    const contributed = contributedExchange([
      { id: "R_app", nameWithOwner: "readmint-fixture/app" },
      { id: "R_priv", nameWithOwner: "readmint-fixture/secret", isPrivate: true },
    ]);
    const history = (ids: string[]) =>
      historyExchange(
        ids.map((id) => ({
          id,
          nameWithOwner: id === "R_app" ? "readmint-fixture/app" : "readmint-fixture/secret",
          commits: [{ oid: oid(id === "R_app" ? 1 : 2), date: "2026-10-01T10:00:00Z" }],
        })),
      );
    return { contributed, history };
  };

  test("another viewer's token reads no private repository", async () => {
    const { contributed, history } = privateScenario();
    const { replay, result } = await run([
      viewerOf("someone-else"),
      ...successExchanges(),
      contributed,
      history(["R_app"]),
      commitExchange("readmint-fixture/app", oid(1), [["a.kt", 5]]),
    ]);
    expect(replay.failures).toEqual([]);
    expect(replay.pending()).toBe(0);
    expect(result.data.languagesAuthored).toHaveLength(1);
  });

  test("the owner's own token reads it, whatever the case of the login", async () => {
    const { contributed, history } = privateScenario();
    const { replay, result } = await run([
      viewerOf(FIXTURE_LOGIN.toUpperCase()),
      ...successExchanges(),
      contributed,
      history(["R_app", "R_priv"]),
      commitExchange("readmint-fixture/app", oid(1), [["a.kt", 5]]),
      commitExchange("readmint-fixture/secret", oid(2), [["b.go", 7]]),
    ]);
    expect(replay.failures).toEqual([]);
    expect(result.data.languagesAuthored.map((entry) => entry.name)).toEqual(["Go", "Kotlin"]);
    expect(JSON.stringify(result.data)).not.toContain("secret");
  });
});

describe("the cache", () => {
  test("a second load reads nothing but the viewer", async () => {
    const cache = new MemoryCache();
    const first = await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)), { cache });
    const second = await run([viewerOf(FIXTURE_LOGIN)], { cache });
    expect(second.replay.failures).toEqual([]);
    expect(gets(second.replay.requests)).toHaveLength(0);
    expect(second.result.meta).toMatchObject({ fromCache: true, requests: 1, partial: [] });
    expect(JSON.stringify(second.result.data)).toBe(JSON.stringify(first.result.data));
  });

  test("a load the cap cut is stored and reports authored-cap again", async () => {
    const cache = new MemoryCache();
    const scenario = authoredScenario();
    await run(authoredExchanges(viewerOf(FIXTURE_LOGIN), scenario.commits.slice(0, 2)), {
      cache,
      languageCommitCap: 2,
    });
    const second = await run([viewerOf(FIXTURE_LOGIN)], { cache, languageCommitCap: 2 });
    expect(second.result.meta).toMatchObject({ fromCache: true, partial: ["authored-cap"] });
  });

  test("a load that stopped early is not stored, but its commits are", async () => {
    const cache = new MemoryCache();
    const scenario = authoredScenario();
    const limited = commitExchange("readmint-fixture/app", oid(3), [], {
      status: 403,
      remaining: 0,
      body: {},
    });
    const first = await run(
      authoredExchanges(viewerOf(FIXTURE_LOGIN), [
        scenario.commits[0] as Exchange,
        scenario.commits[1] as Exchange,
        limited,
      ]),
      { cache },
    );
    expect(first.result.meta.partial).toEqual(["authored"]);
    const second = await run(
      [
        viewerOf(FIXTURE_LOGIN),
        ...successExchanges(),
        scenario.contributed,
        scenario.history,
        scenario.commits[2] as Exchange,
        scenario.commits[3] as Exchange,
      ],
      { cache },
    );
    expect(second.replay.failures).toEqual([]);
    expect(gets(second.replay.requests)).toHaveLength(2);
    expect(second.result.meta.partial).toEqual([]);
    expect(second.result.data.languagesAuthored[0]).toMatchObject({
      name: "Kotlin",
      additions: 240,
    });
  });

  test("another cap misses the main entry but reuses the commits", async () => {
    const cache = new MemoryCache();
    await run(authoredExchanges(viewerOf(FIXTURE_LOGIN)), { cache });
    const scenario = authoredScenario();
    const second = await run(
      [viewerOf(FIXTURE_LOGIN), ...successExchanges(), scenario.contributed, scenario.history],
      { cache, languageCommitCap: 20 },
    );
    expect(second.replay.failures).toEqual([]);
    expect(gets(second.replay.requests)).toHaveLength(0);
    expect(second.result.data.languagesAuthored).toHaveLength(3);
  });
});

describe("deadline, mirrors and unsafe names", () => {
  test("the authored step's own deadline is a partial load, the rest is kept", async () => {
    const deadline = new AbortController();
    const replay = replayFetch(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    const result = await loadGitHubData({
      token: CANARY,
      ...base,
      fetch: (url, init) => {
        if (init.method === "GET") deadline.abort();
        return replay.fetch(url, init);
      },
      languageSignal: deadline.signal,
    });
    expect(result.meta.partial).toEqual(["authored"]);
    expect(result.data.repositories.length).toBeGreaterThan(0);
    expect(result.data.languagesAuthored).toHaveLength(1);
    expect(gets(replay.requests)).toHaveLength(1);
  });

  test("the caller's abort still fails the load when a deadline is set too", async () => {
    const caller = new AbortController();
    const replay = replayFetch(authoredExchanges(viewerOf(FIXTURE_LOGIN)));
    const error: unknown = await loadGitHubData({
      token: CANARY,
      ...base,
      fetch: (url, init) => {
        if (init.method === "GET") caller.abort();
        return replay.fetch(url, init);
      },
      signal: caller.signal,
      languageSignal: new AbortController().signal,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "timeout" });
  });

  const history = (repositories: Parameters<typeof historyExchange>[0]) => [
    viewerOf(FIXTURE_LOGIN),
    ...successExchanges(),
    contributedExchange(repositories.map(({ id, nameWithOwner }) => ({ id, nameWithOwner }))),
    historyExchange(repositories),
  ];

  test("the same commit in two repositories is counted once, in the first by name", async () => {
    const { result, replay } = await run([
      ...history([
        {
          id: "R_a",
          nameWithOwner: "readmint-fixture/a",
          commits: [{ oid: oid(1), date: "2026-10-05T10:00:00Z" }],
        },
        {
          id: "R_b",
          nameWithOwner: "readmint-fixture/b",
          commits: [{ oid: oid(1), date: "2026-10-05T10:00:00Z" }],
        },
      ]),
      commitExchange("readmint-fixture/a", oid(1), [["x.kt", 7]]),
    ]);
    expect(replay.failures).toEqual([]);
    expect(result.data.languagesAuthored).toMatchObject([{ name: "Kotlin", additions: 7 }]);
  });

  test("commits of the same instant are cut at the cap by commit id", async () => {
    const date = "2026-10-05T10:00:00Z";
    const { result, replay } = await run(
      [
        ...history([
          {
            id: "R_a",
            nameWithOwner: "readmint-fixture/a",
            commits: [
              { oid: oid(9), date },
              { oid: oid(2), date },
            ],
          },
        ]),
        commitExchange("readmint-fixture/a", oid(2), [["x.kt", 3]]),
      ],
      { languageCommitCap: 1 },
    );
    expect(replay.failures).toEqual([]);
    expect(result.meta.partial).toEqual(["authored-cap"]);
    expect(result.data.languagesAuthored).toMatchObject([{ name: "Kotlin", additions: 3 }]);
  });

  test.each(["..", "."])("a repository named %j sends no request and is skipped", async (name) => {
    const { result, replay } = await run([
      ...history([
        {
          id: "R_a",
          nameWithOwner: `readmint-fixture/${name}`,
          commits: [{ oid: oid(1), date: "2026-10-05T10:00:00Z" }],
        },
      ]),
    ]);
    expect(gets(replay.requests)).toHaveLength(0);
    expect(result.data.languagesAuthored).toEqual([]);
    expect(result.meta.partial).toEqual([]);
  });
});
