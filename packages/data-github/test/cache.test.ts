import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cacheKey } from "../src/cacheKey.js";
import { allQueries, profileQuery } from "../src/githubQueries.js";
import { loadGitHubData, MemoryCache, type GitHubCache } from "../src/index.js";
import { FILE_CACHE_MAX_ENTRY_BYTES, FileCache } from "../src/node/index.js";
import { item, withBody, withViewer } from "./fixtureBodies.js";
import {
  exchange,
  FIXTURE_LOGIN,
  replayFetch,
  successExchanges,
  type Exchange,
} from "./replayFetch.js";

const expectedText = JSON.stringify(
  JSON.parse(
    readFileSync(new URL("./fixtures/expected-github-data.json", import.meta.url), "utf8"),
  ),
);

/** A login-mode load of the fixture user through `cache`, by the token owner `viewer`. */
function load(cache: GitHubCache, viewer = FIXTURE_LOGIN, exchanges = successExchanges()) {
  const replay = replayFetch([withViewer(exchange("viewer"), viewer), ...exchanges]);
  return loadGitHubData({
    token: `token-of-${viewer}`,
    login: FIXTURE_LOGIN,
    pageSize: 2,
    cache,
    fetch: replay.fetch,
  }).then((result) => ({ result, replay }));
}

function operations(requests: readonly { body: string }[]): unknown[] {
  return requests.map(
    (request) => (JSON.parse(request.body) as { operationName: unknown }).operationName,
  );
}

/** A recorded error answer, as the reply to the token-owner request. */
function asViewerExchange(source: Exchange): Exchange {
  return { ...source, request: { operation: "ReadmintViewer", variables: {} } };
}

const base = { viewer: FIXTURE_LOGIN, login: FIXTURE_LOGIN, pageSize: 2, maxRepositories: 300 };

describe("loading through a cache", () => {
  test("a second load by the same viewer sends only the viewer request", async () => {
    const cache = new MemoryCache();
    const first = await load(cache);
    const second = await load(cache, FIXTURE_LOGIN, []);
    expect(first.result.meta.fromCache).toBe(false);
    expect(operations(first.replay.requests)).toEqual([
      "ReadmintViewer",
      "ReadmintProfile",
      "ReadmintRepositories",
      "ReadmintRepositories",
      "ReadmintRepositories",
      "ReadmintActivity",
      "ReadmintWeeks",
    ]);
    expect(second.replay.failures).toEqual([]);
    expect(operations(second.replay.requests)).toEqual(["ReadmintViewer"]);
    expect(second.result.meta).toMatchObject({ requests: 1, fromCache: true });
    expect(JSON.stringify(second.result.data)).toBe(JSON.stringify(first.result.data));
    expect(JSON.stringify(second.result.data)).toBe(expectedText);
  });

  test("another viewer of the same login misses, since GitHub answers per viewer", async () => {
    const cache = new MemoryCache();
    await load(cache, "alice");
    const other = await load(cache, "bob");
    expect(other.replay.failures).toEqual([]);
    expect(other.result.meta.fromCache).toBe(false);
    expect(other.replay.requests).toHaveLength(7);
    const again = await load(cache, "bob", []);
    expect(again.result.meta.fromCache).toBe(true);
  });

  test("an expired entry is fetched again", async () => {
    let now = 1_000_000;
    const cache = new MemoryCache({ now: () => now });
    await load(cache);
    now += 3600 * 1000;
    const again = await load(cache);
    expect(again.result.meta.fromCache).toBe(false);
    expect(again.replay.requests).toHaveLength(7);
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
    const stored = await cache.get(await cacheKey(base));
    if (stored === undefined) throw new Error("the first load stored nothing");
    await cache.set(await cacheKey({ ...base, login: "someone-else" }), stored, 3600);
    const replay = replayFetch([exchange("viewer")]);
    const error: unknown = await loadGitHubData({
      token: "test-token",
      login: "someone-else",
      pageSize: 2,
      cache,
      fetch: replay.fetch,
    }).catch((reason: unknown) => reason);
    expect(operations(replay.requests)).toEqual(["ReadmintViewer", "ReadmintProfile"]);
    expect(error).toBeDefined();
  });

  test("a cache whose reads and writes fail is skipped", async () => {
    let calls = 0;
    const broken: GitHubCache = {
      get: () => {
        calls += 1;
        return Promise.reject(new Error("EACCES: permission denied, open '/cache/x.json'"));
      },
      set: () => {
        calls += 1;
        throw new Error("ENOSPC: no space left on device");
      },
    };
    const { result, replay } = await load(broken);
    expect(calls).toBe(2);
    expect(replay.pending()).toBe(0);
    expect(result.meta.fromCache).toBe(false);
    expect(JSON.stringify(result.data)).toBe(expectedText);
  });

  test("an app token owned by a bot is cached and hits on the second load", async () => {
    const cache = new MemoryCache();
    const first = await load(cache, "github-actions[bot]");
    expect(first.replay.failures).toEqual([]);
    expect(first.result.meta.fromCache).toBe(false);
    const second = await load(cache, "github-actions[bot]", []);
    expect(second.replay.failures).toEqual([]);
    expect(second.result.meta.fromCache).toBe(true);
    expect(JSON.stringify(second.result.data)).toBe(expectedText);
  });

  test.each([
    [
      "a graphql error",
      withBody(exchange("viewer"), (body) => {
        body.data = null;
        body.errors = [{ type: "INTERNAL", message: "Something went wrong" }];
      }),
    ],
    ["a 403", asViewerExchange(exchange("forbidden"))],
    ["an invalid owner", withViewer(exchange("viewer"), "not a login")],
  ])("an owner lookup failing with %s loads uncached", async (_name, ownerAnswer) => {
    let writes = 0;
    const inner = new MemoryCache();
    const cache: GitHubCache = {
      get: (key) => inner.get(key),
      set: (key, value, ttlSeconds) => {
        writes += 1;
        return inner.set(key, value, ttlSeconds);
      },
    };
    const replay = replayFetch([ownerAnswer, ...successExchanges()]);
    const result = await loadGitHubData({
      token: "test-token",
      login: FIXTURE_LOGIN,
      pageSize: 2,
      cache,
      fetch: replay.fetch,
    });
    expect(replay.failures).toEqual([]);
    expect(replay.pending()).toBe(0);
    expect(result.meta).toMatchObject({ requests: 7, fromCache: false });
    expect(JSON.stringify(result.data)).toBe(expectedText);
    expect(writes).toBe(0);
  });

  test.each([
    ["unauthorized", exchange("unauthorized")],
    ["rate-limited", exchange("rate-limit-primary-403")],
  ])("an owner lookup failing as %s still fails the load", async (code, answer) => {
    const replay = replayFetch([asViewerExchange(answer)]);
    await expect(
      loadGitHubData({
        token: "test-token",
        login: FIXTURE_LOGIN,
        pageSize: 2,
        cache: new MemoryCache(),
        fetch: replay.fetch,
      }),
    ).rejects.toMatchObject({ code });
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
  test("is a SHA-256 digest that ignores the token and the case of logins", async () => {
    const key = await cacheKey(base);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await cacheKey({
        ...base,
        viewer: FIXTURE_LOGIN.toUpperCase(),
        login: FIXTURE_LOGIN.toUpperCase(),
      }),
    ).toBe(key);
    const cache = new MemoryCache();
    await load(cache);
    const replay = replayFetch([exchange("viewer")]);
    const second = await loadGitHubData({
      token: "another-token-of-the-same-owner",
      login: FIXTURE_LOGIN,
      pageSize: 2,
      cache,
      fetch: replay.fetch,
    });
    expect(second.meta.fromCache).toBe(true);
    expect(item(replay.requests, 0).headers.authorization).toBe(
      "bearer another-token-of-the-same-owner",
    );
  });

  test("changes with the viewer, the login, the paging options and the query text", async () => {
    const key = await cacheKey(base);
    const changedQueries = allQueries.map((query) =>
      query === profileQuery ? { ...query, query: `${query.query}\n` } : query,
    );
    const others = await Promise.all([
      cacheKey({ ...base, viewer: "someone-else" }),
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
    const second = await load(cache, FIXTURE_LOGIN, []);
    expect(second.result.meta.fromCache).toBe(true);
    expect(operations(second.replay.requests)).toEqual(["ReadmintViewer"]);
  });
});
