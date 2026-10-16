import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryCache, type DataSourceCache } from "@readmint/data";
import { FileCache } from "@readmint/data/node";
import { afterEach, describe, expect, test } from "vitest";
import { loadFeedData, type FeedFetch } from "../src/index.js";
import { fixture, stubFetch, xml } from "./stubFetch.js";

const URL_SOURCE = "https://unsorted.example/rss.xml";
const FEED = fixture("unsorted.rss.xml");

const load = (
  fetch: FeedFetch,
  cache: DataSourceCache,
  extra: { maxBytes?: number; url?: string; limit?: number } = {},
) => loadFeedData({ url: URL_SOURCE, fetch, cache, ...extra });

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "readmint-feed-cache-"));
  directories.push(directory);
  return directory;
}

class KeyRecorder implements DataSourceCache {
  readonly keys: string[] = [];
  private readonly inner = new MemoryCache();
  get(key: string): Promise<string | undefined> {
    this.keys.push(key);
    return this.inner.get(key);
  }
  set(key: string, value: string, ttl: number): Promise<void> {
    return this.inner.set(key, value, ttl);
  }
}

describe("cache", () => {
  test("a second load comes from a MemoryCache without a request", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(() => xml(FEED));
    const first = await load(stub.fetch, cache);
    const second = await load(stub.fetch, cache);
    expect(first.meta).toEqual({ requests: 1, fromCache: false });
    expect(second.meta).toEqual({ requests: 0, fromCache: true });
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
    expect(stub.calls).toHaveLength(1);
  });

  test("a FileCache in a directory serves the second load", async () => {
    const directory = await temporaryDirectory();
    const stub = stubFetch(() => xml(FEED));
    const first = await load(stub.fetch, new FileCache({ directory }));
    const second = await load(stub.fetch, new FileCache({ directory }));
    expect(second.meta.fromCache).toBe(true);
    expect(second.data).toEqual(first.data);
  });

  test("a different limit reads the same entry and applies its own limit", async () => {
    const cache = new KeyRecorder();
    const stub = stubFetch(() => xml(FEED));
    await load(stub.fetch, cache, { limit: 2 });
    const wider = await load(stub.fetch, cache, { limit: 50 });
    expect(stub.calls).toHaveLength(1);
    expect(wider.meta.fromCache).toBe(true);
    expect(wider.data.entries).toHaveLength(7);
    expect(new Set(cache.keys).size).toBe(1);
  });

  test("a corrupt entry is a miss and the feed is fetched again", async () => {
    const directory = await temporaryDirectory();
    const cache = new FileCache({ directory });
    const stub = stubFetch(() => xml(FEED));
    await load(stub.fetch, cache);
    const [file] = await readdir(directory);
    if (file === undefined) throw new Error("no cache entry");
    await writeFile(
      join(directory, file),
      JSON.stringify({ storedAt: Date.now(), ttlSeconds: 3600, value: "<!DOCTYPE x><rss/>" }),
    );
    const again = await load(stub.fetch, cache);
    expect(again.meta).toEqual({ requests: 1, fromCache: false });
    expect(again.data.entries).toHaveLength(5);
  });

  test("a cache that rejects does not fail the load", async () => {
    const broken: DataSourceCache = {
      get: () => Promise.reject(new Error("disk")),
      set: () => Promise.reject(new Error("disk")),
    };
    const { data } = await load(stubFetch(() => xml(FEED)).fetch, broken);
    expect(data.entries).toHaveLength(5);
  });

  test("a document that fails to parse is never stored", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(
      () => xml("<html/>"),
      () => xml(FEED),
    );
    await expect(load(stub.fetch, cache)).rejects.toMatchObject({ code: "invalid-response" });
    const second = await load(stub.fetch, cache);
    expect(second.meta.fromCache).toBe(false);
  });

  test("the key differs per URL and per maxBytes, never per limit, and is a bare digest", async () => {
    const cache = new KeyRecorder();
    const stub = stubFetch(() => xml(FEED));
    await load(stub.fetch, cache);
    await load(stub.fetch, cache, { url: `${URL_SOURCE}?page=2` });
    await load(stub.fetch, cache, { maxBytes: 4096 });
    await load(stub.fetch, cache, { limit: 9 });
    expect(new Set(cache.keys).size).toBe(3);
    for (const key of cache.keys) expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
