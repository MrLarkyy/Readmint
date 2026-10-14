import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cacheKey } from "../src/cacheKey.js";
import { allQueries, profileQuery } from "../src/githubQueries.js";
import { loadGitHubData, MemoryCache, type GitHubCache } from "../src/index.js";
import { FILE_CACHE_MAX_ENTRY_BYTES, FileCache } from "../src/node/index.js";
import { FIXTURE_LOGIN, replayFetch, successExchanges } from "./replayFetch.js";

function load(cache: GitHubCache, token = "test-token") {
  const replay = replayFetch(successExchanges());
  return loadGitHubData({
    token,
    login: FIXTURE_LOGIN,
    pageSize: 2,
    cache,
    fetch: replay.fetch,
  }).then((result) => ({ result, replay }));
}

const base = { login: FIXTURE_LOGIN, pageSize: 2, maxRepositories: 300 };

describe("loading through a cache", () => {
  test("a second load is served from the cache without a request", async () => {
    const cache = new MemoryCache();
    const first = await load(cache);
    const second = await load(cache);
    expect(first.result.meta.fromCache).toBe(false);
    expect(second.replay.requests).toEqual([]);
    expect(second.result.meta).toMatchObject({ requests: 0, fromCache: true });
    expect(JSON.stringify(second.result.data)).toBe(JSON.stringify(first.result.data));
  });

  test("an expired entry is fetched again", async () => {
    let now = 1_000_000;
    const cache = new MemoryCache({ now: () => now });
    await load(cache);
    now += 3600 * 1000;
    const again = await load(cache);
    expect(again.result.meta.fromCache).toBe(false);
    expect(again.replay.requests).toHaveLength(4);
  });

  test("an entry that fails validation is a miss and is replaced", async () => {
    const cache = new MemoryCache();
    const key = await cacheKey(base);
    for (const tampered of ["not json", "[]", JSON.stringify({ profile: {}, pages: [{}] })]) {
      await cache.set(key, tampered, 3600);
      const { result, replay } = await load(cache);
      expect(result.meta.fromCache).toBe(false);
      expect(replay.pending()).toBe(0);
      expect(await cache.get(key)).not.toBe(tampered);
    }
  });

  test("an entry of another login is a miss", async () => {
    const cache = new MemoryCache();
    await load(cache);
    const key = await cacheKey(base);
    const stored = await cache.get(key);
    if (stored === undefined) throw new Error("the first load stored nothing");
    const otherKey = await cacheKey({ ...base, login: "someone-else" });
    await cache.set(otherKey, stored, 3600);
    const replay = replayFetch([]);
    const error: unknown = await loadGitHubData({
      token: "test-token",
      login: "someone-else",
      pageSize: 2,
      cache,
      fetch: replay.fetch,
    }).catch((reason: unknown) => reason);
    expect(replay.requests).toHaveLength(1);
    expect(error).toBeDefined();
  });

  test("the memory cache drops its oldest entries past maxEntries", async () => {
    const cache = new MemoryCache({ maxEntries: 2 });
    await cache.set("a", "1", 60);
    await cache.set("b", "2", 60);
    await cache.set("c", "3", 60);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("c")).toBe("3");
  });
});

describe("cache key", () => {
  test("is a SHA-256 digest that ignores the token and the login's case", async () => {
    const key = await cacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const cache = new MemoryCache();
    await load(cache, "token-one");
    const second = await load(cache, "token-two");
    expect(second.result.meta.fromCache).toBe(true);
    expect(await cacheKey({ ...base, login: FIXTURE_LOGIN.toUpperCase() })).toBe(key);
  });

  test("changes with the login, the paging options and the query text", async () => {
    const key = await cacheKey(base);
    const changedQueries = allQueries.map((query) =>
      query === profileQuery ? { ...query, query: `${query.query}\n` } : query,
    );
    const others = await Promise.all([
      cacheKey({ ...base, login: "someone-else" }),
      cacheKey({ ...base, pageSize: 50 }),
      cacheKey({ ...base, maxRepositories: 10 }),
      cacheKey(base, changedQueries),
    ]);
    for (const other of others) expect(other).not.toBe(key);
    expect(new Set(others).size).toBe(others.length);
  });
});

describe("FileCache", () => {
  let directory: string;
  let now = 5_000_000;
  const key = "a".repeat(64);

  beforeEach(async () => {
    directory = join(await mkdtemp(join(tmpdir(), "readmint-cache-")), "nested");
    now = 5_000_000;
  });

  afterEach(async () => {
    await rm(join(directory, ".."), { recursive: true, force: true });
  });

  const fileCache = () => new FileCache({ directory, now: () => now });

  test("round-trips an entry and leaves no temporary file", async () => {
    await fileCache().set(key, "value", 60);
    expect(await fileCache().get(key)).toBe("value");
    expect(await readdir(directory)).toEqual([`${key}.json`]);
  });

  test.skipIf(process.platform === "win32")("writes owner-only files", async () => {
    await fileCache().set(key, "value", 60);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, `${key}.json`))).mode & 0o777).toBe(0o600);
  });

  test("an expired entry is a miss", async () => {
    await fileCache().set(key, "value", 60);
    now += 60_000;
    expect(await fileCache().get(key)).toBeUndefined();
  });

  test("a corrupt or malformed file is a miss", async () => {
    await fileCache().set(key, "value", 60);
    const path = join(directory, `${key}.json`);
    for (const content of [
      "{not json",
      "null",
      JSON.stringify({ storedAt: now, ttlSeconds: 60, value: 5 }),
    ]) {
      await writeFile(path, content);
      expect(await fileCache().get(key)).toBeUndefined();
    }
  });

  test("an oversized file is a miss", async () => {
    await fileCache().set(key, "value", 60);
    await writeFile(join(directory, `${key}.json`), Buffer.alloc(FILE_CACHE_MAX_ENTRY_BYTES + 1));
    expect(await fileCache().get(key)).toBeUndefined();
  });

  test("a missing entry or a key that is not a digest is a miss, and set refuses it", async () => {
    expect(await fileCache().get(key)).toBeUndefined();
    expect(await fileCache().get("../escape")).toBeUndefined();
    await expect(fileCache().set("../escape", "value", 60)).rejects.toThrow(TypeError);
  });

  test("serves a second load from disk", async () => {
    const cache = fileCache();
    await load(cache);
    const second = await load(cache);
    expect(second.result.meta.fromCache).toBe(true);
    expect(second.replay.requests).toEqual([]);
  });
});
