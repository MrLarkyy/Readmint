import { describe, expect, test } from "vitest";
import { loadGitHubData, type GitHubSourceOptions } from "../src/index.js";
import {
  commit,
  contribution,
  FALLBACK_IDS,
  fallbackExchanges,
  weeksFor,
  weeksNode,
  withActivity,
} from "./activityBodies.js";
import { item } from "./fixtureBodies.js";
import {
  exchange,
  FIXTURE_LOGIN,
  pageExchanges,
  replayFetch,
  sentVariables,
  successExchanges,
  type Exchange,
  type Replay,
} from "./replayFetch.js";

function load(replay: Replay, options: Partial<GitHubSourceOptions> = {}) {
  return loadGitHubData({
    token: "test-token",
    login: FIXTURE_LOGIN,
    pageSize: 2,
    fetch: replay.fetch,
    ...options,
  });
}

async function loadData(exchanges: readonly Exchange[]) {
  const replay = replayFetch(exchanges);
  const result = await load(replay);
  expect(replay.failures).toEqual([]);
  expect(replay.pending()).toBe(0);
  return result;
}

/** The three pages followed by the given activity and weeks exchanges. */
const afterPages = (...rest: Exchange[]) => [...pageExchanges(), ...rest];
const READMINT_ONLY = ["R_readmint"];

/** The first repositories page without any repository. */
function emptyPage(): Exchange {
  const source = exchange("repositories-1");
  const body = structuredClone(source.body) as {
    data: { user: { repositories: Record<string, unknown> } };
  };
  body.data.user.repositories.totalCount = 0;
  body.data.user.repositories.pageInfo = { hasNextPage: false, endCursor: null };
  body.data.user.repositories.nodes = [];
  return { ...source, body };
}

describe("requests", () => {
  test("the activity and weeks requests follow the pages, the window only in variables", async () => {
    const replay = replayFetch(successExchanges());
    await load(replay);
    expect(replay.failures).toEqual([]);
    const operations = replay.requests.map(
      (request) => (JSON.parse(request.body) as { operationName: string }).operationName,
    );
    expect(operations).toEqual([
      "ReadmintProfile",
      "ReadmintRepositories",
      "ReadmintRepositories",
      "ReadmintRepositories",
      "ReadmintActivity",
      "ReadmintWeeks",
    ]);
    expect(sentVariables(item(replay.requests, 4))).toEqual({
      login: FIXTURE_LOGIN,
      author: "MDQ6VXNlcjE=",
      from: "2026-10-07T00:00:00Z",
      to: "2026-10-14T00:00:00Z",
      since: "2026-10-07T00:00:00Z",
      until: "2026-10-14T00:00:00Z",
    });
    const weeks = sentVariables(item(replay.requests, 5)) as Record<string, unknown>;
    expect(weeks.ids).toEqual(["R_site", "R_readmint"]);
    expect(weeks.author).toBe("MDQ6VXNlcjE=");
    expect(weeks.t0).toBe("2025-10-15T00:00:00Z");
    expect(weeks.t52).toBe("2026-10-14T00:00:00Z");
    expect(Object.keys(weeks)).toHaveLength(2 + 53);
    for (const request of replay.requests.slice(4)) {
      const { query } = JSON.parse(request.body) as { query: string };
      for (const value of [FIXTURE_LOGIN, "MDQ6VXNlcjE=", "2026-10-14", "R_site"]) {
        expect(query).not.toContain(value);
      }
    }
  });

  test("an account without repositories or pins sends no weeks request", async () => {
    const replay = replayFetch([exchange("profile"), emptyPage(), exchange("activity-no-pinned")]);
    const { data, meta } = await load(replay);
    expect(replay.failures).toEqual([]);
    expect(replay.pending()).toBe(0);
    expect(data.pinned).toEqual([]);
    expect(meta.requests).toBe(3);
    expect(meta.partial).toEqual([]);
  });
});

describe("pinned", () => {
  test("keeps the pin order, not the star order, with the weekly commits of the pinned ids", async () => {
    const { data } = await loadData(successExchanges());
    expect(data.pinned.map((repository) => repository.name)).toEqual(["site", "readmint"]);
    for (const repository of data.pinned) {
      expect(repository.weeklyCommits).toHaveLength(52);
    }
    expect(item(data.pinned, 0).weeklyCommits?.slice(0, 3)).toEqual([3, 10, 6]);
  });

  test("falls back to the most starred own repositories without pins", async () => {
    const { data } = await loadData(fallbackExchanges());
    expect(data.pinned.map((repository) => repository.name)).toEqual([
      "readmint",
      "dotfiles",
      "notes",
      "site",
    ]);
    expect(data.pinned.every((repository) => !repository.isFork)).toBe(true);
    expect(data.pinned.every((repository) => repository.weeklyCommits?.[0] === 1)).toBe(true);
  });

  test("a private or missing pin is dropped, the public one stays", async () => {
    const { data } = await loadData(
      afterPages(
        exchange("activity-private"),
        weeksFor(["R_dotfiles"], [weeksNode("R_dotfiles", 2)]),
      ),
    );
    expect(data.pinned.map((repository) => repository.name)).toEqual(["dotfiles"]);
    expect(JSON.stringify(data)).not.toContain("secret-plans");
  });

  test("only private pins fall back to the own repositories", async () => {
    const onlyPrivate = withActivity((user) => {
      user.pinnedItems.nodes = user.pinnedItems.nodes.slice(0, 1);
    }, exchange("activity-private"));
    const { data } = await loadData(fallbackExchanges(onlyPrivate));
    expect(data.pinned.map((repository) => repository.name)).toEqual([
      "readmint",
      "dotfiles",
      "notes",
      "site",
    ]);
    expect(JSON.stringify(data)).not.toContain("secret-plans");
  });

  test("a repository without a default branch has 52 zeros", async () => {
    const { data } = await loadData(
      afterPages(
        withActivity((user) => {
          user.pinnedItems.nodes = user.pinnedItems.nodes.slice(1);
        }),
        weeksFor(READMINT_ONLY, [{ id: "R_readmint", defaultBranchRef: null }]),
      ),
    );
    expect(item(data.pinned, 0).weeklyCommits).toEqual(new Array<number>(52).fill(0));
  });
});

describe("pushes", () => {
  test("lists the user's public commits newest first, ties by repository", async () => {
    const { data } = await loadData(successExchanges());
    expect(data.pushes.map((push) => `${push.repository} ${push.hash}`)).toEqual([
      "dotfiles d4e5f6a",
      "readmint a1b2c3d",
      "readmint b2c3d4e",
      "dotfiles e5f6a7b",
      "readmint c3d4e5f",
    ]);
    expect(item(data.pushes, 1)).toEqual({
      repository: "readmint",
      hash: "a1b2c3d",
      message: "Add pinned repositories to the GitHub loader",
      additions: 120,
      deletions: 14,
      date: "2026-10-13T09:15:00Z",
    });
  });

  test("drops private repositories, whatever their commits", async () => {
    const { data } = await loadData(successExchanges());
    expect(JSON.stringify(data)).not.toContain("Private roadmap");
    expect(JSON.stringify(data)).not.toContain("secret-plans");
  });

  test("keeps one entry per repository and commit and at most ten, the newest", async () => {
    const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T10:00:00Z`;
    const many = Array.from({ length: 10 }, (_, index) =>
      commit(`${String(index).padStart(2, "0")}aaaaaaaaaaaa`, day(index + 3)),
    );
    const { data } = await loadData(
      afterPages(
        withActivity((user) => {
          user.contributionsCollection.commitContributionsByRepository = [
            contribution("readmint", many),
            // the same repository listed twice, and older commits of another one
            contribution("readmint", many.slice(0, 2)),
            contribution("dotfiles", [
              commit("ffbbbbbbbbbbbb", day(2)),
              commit("eebbbbbbbbbbbb", day(1)),
            ]),
          ];
        }),
        exchange("weeks"),
      ),
    );
    expect(data.pushes).toHaveLength(10);
    expect(data.pushes.map((push) => push.hash)).toEqual(
      [...many].reverse().map((entry) => entry.oid.slice(0, 7)),
    );
  });

  test("a repository with no default branch adds no commits", async () => {
    const { data } = await loadData(successExchanges());
    expect(data.pushes.some((push) => push.repository === "site")).toBe(false);
  });

  test("clips a long message on a code point boundary instead of failing", async () => {
    const atAstral = `${"a".repeat(1023)}😀tail`;
    const { data } = await loadData(
      afterPages(
        withActivity((user) => {
          user.contributionsCollection.commitContributionsByRepository = [
            contribution("readmint", [
              commit("11aaaaaaaaaaaa", "2026-10-13T10:00:00Z", atAstral),
              commit("22aaaaaaaaaaaa", "2026-10-12T10:00:00Z", "b".repeat(5000)),
              commit("33aaaaaaaaaaaa", "2026-10-11T10:00:00Z", "😀".repeat(600)),
            ]),
          ];
        }),
        exchange("weeks"),
      ),
    );
    expect(item(data.pushes, 0).message).toBe("a".repeat(1023));
    expect(item(data.pushes, 1).message).toBe("b".repeat(1024));
    const emoji = item(data.pushes, 2).message;
    expect(emoji).toBe("😀".repeat(512));
  });

  test("two loads give the same bytes whatever the order of the commit nodes", async () => {
    const reversed = successExchanges().map((source) =>
      source.request.operation === "ReadmintActivity"
        ? withActivity((user) => {
            const repositories = user.contributionsCollection.commitContributionsByRepository;
            repositories.reverse();
            for (const entry of repositories) {
              entry.repository.defaultBranchRef?.target.history.nodes.reverse();
            }
          }, source)
        : source,
    );
    const first = await loadData(successExchanges());
    const second = await loadData(reversed);
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
  });
});

describe("status", () => {
  test("carries the message and the emoji shortcode", async () => {
    const { data } = await loadData(successExchanges());
    expect(data.status).toEqual({ message: "Shipping the GitHub loader", emoji: ":rocket:" });
  });

  test("is null when none is set", async () => {
    const { data } = await loadData(fallbackExchanges());
    expect(data.status).toBeNull();
  });

  test("keeps an emoji without a message", async () => {
    const { data } = await loadData(
      afterPages(
        withActivity((user) => {
          user.status = { message: null, emoji: ":coffee:" };
        }),
        exchange("weeks"),
      ),
    );
    expect(data.status).toEqual({ message: null, emoji: ":coffee:" });
  });

  test("is null when message and emoji are both empty", async () => {
    const { data } = await loadData(
      afterPages(
        withActivity((user) => {
          user.status = { message: null, emoji: null };
        }),
        exchange("weeks"),
      ),
    );
    expect(data.status).toBeNull();
  });
});

test("the fallback ids follow the fixture's star order", () => {
  expect(FALLBACK_IDS).toEqual(["R_readmint", "R_dotfiles", "R_notes", "R_site"]);
});
