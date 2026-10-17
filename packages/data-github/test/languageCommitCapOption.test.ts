import { describe, expect, test } from "vitest";
import { cacheKey } from "../src/cacheKey.js";
import { GitHubLimits, loadGitHubData } from "../src/index.js";
import { replayFetch } from "./replayFetch.js";

describe("languageCommitCap", () => {
  test("the limit and the default are the documented ones", () => {
    expect(GitHubLimits.maxLanguageCommitCap).toBe(2000);
    expect(GitHubLimits.defaultLanguageCommitCap).toBe(0);
    expect(GitHubLimits.languageCommitsPerRepository).toBe(100);
    expect(GitHubLimits.authoredHistoryRepositoriesPerRequest).toBe(10);
    expect(GitHubLimits.restRateLimitFloor).toBe(100);
  });

  test.each([-1, 2001, 1.5, Number.NaN, "5" as unknown as number])(
    "%j fails with invalid-option before any request",
    async (value) => {
      const replay = replayFetch([]);
      await expect(
        loadGitHubData({ token: "t", login: "a", languageCommitCap: value, fetch: replay.fetch }),
      ).rejects.toMatchObject({
        code: "invalid-option",
        message: "languageCommitCap must be an integer from 0 to 2000.",
      });
      expect(replay.requests).toHaveLength(0);
    },
  );
});

describe("cacheKey and languageCommitCap", () => {
  const base = { viewer: "v", login: "l", pageSize: 100, maxRepositories: 300 };

  test("0 or absent leaves the key as it was; another cap is another key", async () => {
    const plain = await cacheKey(base);
    expect(await cacheKey({ ...base, languageCommitCap: 0 })).toBe(plain);
    const small = await cacheKey({ ...base, languageCommitCap: 5 });
    const large = await cacheKey({ ...base, languageCommitCap: 6 });
    expect(new Set([plain, small, large]).size).toBe(3);
  });
});
