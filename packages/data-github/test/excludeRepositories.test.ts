import { describe, expect, test } from "vitest";
import { loadGitHubData, MemoryCache, type GitHubSourceOptions } from "../src/index.js";
import { FALLBACK_IDS, fallbackExchanges, weeksFor, weeksNode } from "./activityBodies.js";
import {
  exchange,
  FIXTURE_LOGIN,
  replayFetch,
  sentVariables,
  type Exchange,
} from "./replayFetch.js";

function load(exchanges: readonly Exchange[], options: Partial<GitHubSourceOptions> = {}) {
  const replay = replayFetch(exchanges);
  return loadGitHubData({
    token: "test-token",
    login: FIXTURE_LOGIN,
    pageSize: 2,
    fetch: replay.fetch,
    ...options,
  }).then((result) => ({ result, replay }));
}

const remainingIds = FALLBACK_IDS.filter((id) => id !== "R_readmint");

function withoutReadmint(): Exchange[] {
  return [
    ...fallbackExchanges().slice(0, -1),
    weeksFor(
      remainingIds,
      remainingIds.map((id) => weeksNode(id, 1)),
    ),
  ];
}

describe("excludeRepositories", () => {
  test("drops the repository from every aggregate, case-insensitively, and from the weekly request", async () => {
    const { result, replay } = await load(withoutReadmint(), {
      excludeRepositories: ["READMINT"],
    });
    const { data } = result;
    expect(replay.failures).toEqual([]);
    expect(replay.pending()).toBe(0);
    expect(data.repositories.map((entry) => entry.name)).not.toContain("readmint");
    expect(data.pinned.map((entry) => entry.name)).toEqual(["dotfiles", "notes", "site"]);
    const weeks = replay.requests.at(-1);
    expect(weeks === undefined ? null : sentVariables(weeks)).toMatchObject({ ids: remainingIds });
    const sources = data.repositories.filter((entry) => !entry.isFork);
    expect(data.counts.stars).toBe(sources.reduce((total, entry) => total + entry.stars, 0));
    const bytes = sources
      .flatMap((entry) => entry.languages)
      .reduce((total, language) => total + language.bytes, 0);
    expect(data.languages.reduce((total, entry) => total + entry.bytes, 0)).toBe(bytes);
    const names = new Set(sources.flatMap((entry) => entry.languages.map((l) => l.name)));
    expect(new Set(data.languages.map((entry) => entry.name))).toEqual(names);
    expect(new Set(data.languagesByRepo.map((entry) => entry.name))).toEqual(names);
    expect(new Set(data.languageRepositories.map((entry) => entry.name))).toEqual(names);
    expect(data.counts.repositories).toBe(5);
  });

  test("matches owner/name too", async () => {
    const { result } = await load(withoutReadmint(), {
      excludeRepositories: [`${FIXTURE_LOGIN}/readmint`],
    });
    expect(result.data.repositories.map((entry) => entry.name)).not.toContain("readmint");
  });

  test("a cached load is reused only with the same list", async () => {
    const cache = new MemoryCache();
    const viewer = exchange("viewer");
    const first = await load([viewer, ...withoutReadmint()], {
      cache,
      excludeRepositories: ["readmint"],
    });
    const same = await load([viewer], { cache, excludeRepositories: ["Readmint"] });
    expect(same.result.meta.fromCache).toBe(true);
    expect(JSON.stringify(same.result.data)).toBe(JSON.stringify(first.result.data));
    const other = await load([viewer, ...fallbackExchanges()], { cache });
    expect(other.result.meta.fromCache).toBe(false);
    expect(other.replay.failures).toEqual([]);
  });

  test("rejects a bad list without echoing the entry", async () => {
    const lists: unknown[] = [
      ["fine", "not a name secret-repo"],
      ["../secret-repo"],
      [42],
      "secret-repo",
      Array.from({ length: 101 }, (_, index) => `repo-${String(index)}`),
    ];
    for (const list of lists) {
      const error = await load([], {
        excludeRepositories: list as readonly string[],
      }).then(
        () => undefined,
        (reason: unknown) => reason as Error,
      );
      expect(error).toMatchObject({ code: "invalid-option" });
      expect(error?.message).not.toContain("secret-repo");
    }
  });
});
