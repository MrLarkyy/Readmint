import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryCache, type DataSourceCache } from "@readmint/data";
import { FileCache } from "@readmint/data/node";
import { afterEach, describe, expect, test } from "vitest";
import { loadJsonData } from "../src/index.js";
import { json, stubFetch } from "./stubFetch.js";

const SECRET = "s3cr3t-key-7f3a91c2";
const OTHER_SECRET = "t0ken-value-b41d88e0";
const urlWith = (secret: string) =>
  `https://api.example/data.json?api_key=${secret}&token=${OTHER_SECRET}`;

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

class KeyRecorder implements DataSourceCache {
  readonly keys: string[] = [];
  private readonly inner = new MemoryCache();
  get(key: string): Promise<string | undefined> {
    this.keys.push(key);
    return this.inner.get(key);
  }
  set(key: string, value: string, ttl: number): Promise<void> {
    this.keys.push(key);
    return this.inner.set(key, value, ttl);
  }
}

function expectNoLeak(text: string): void {
  for (const part of [SECRET, OTHER_SECRET, "api_key", "token", "api.example"])
    expect(text).not.toContain(part);
}

describe("cache key of a URL holding a secret", () => {
  test("every key is a bare digest that holds neither the URL nor its secrets", async () => {
    const cache = new KeyRecorder();
    const stub = stubFetch(() => json("{}"));
    await loadJsonData({ source: urlWith(SECRET), fetch: stub.fetch, cache });
    expect(stub.calls[0]?.url).toContain(SECRET);
    expect(cache.keys.length).toBeGreaterThanOrEqual(2);
    for (const key of cache.keys) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expectNoLeak(key);
    }
  });

  test("a FileCache names its entries by digest only", async () => {
    const directory = await mkdtemp(join(tmpdir(), "readmint-json-keysecret-"));
    directories.push(directory);
    const stub = stubFetch(() => json("{}"));
    const cache = new FileCache({ directory });
    await loadJsonData({ source: urlWith(SECRET), fetch: stub.fetch, cache });
    const names = await readdir(directory);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/^[0-9a-f]{64}\.json$/);
      expectNoLeak(name);
    }
    const again = await loadJsonData({ source: urlWith(SECRET), fetch: stub.fetch, cache });
    expect(again.meta.fromCache).toBe(true);
  });

  test("a rotated secret is a different key, so a miss", async () => {
    const cache = new KeyRecorder();
    const stub = stubFetch(() => json("{}"));
    await loadJsonData({ source: urlWith(SECRET), fetch: stub.fetch, cache });
    const first = new Set(cache.keys);
    cache.keys.length = 0;
    const rotated = await loadJsonData({
      source: urlWith("rotated-9d2e5b17"),
      fetch: stub.fetch,
      cache,
    });
    expect(rotated.meta.fromCache).toBe(false);
    expect(cache.keys.length).toBeGreaterThan(0);
    for (const key of cache.keys) expect(first.has(key)).toBe(false);
  });
});
