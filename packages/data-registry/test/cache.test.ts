import { MemoryCache, type DataSourceCache } from "@readmint/data";
import { describe, expect, test } from "vitest";
import { loadRegistryData } from "../src/index.js";
import { registryApis, stubFetch } from "./stubFetch.js";

const ALL = { npm: ["react"], maven: ["junit:junit"] };

describe("cache", () => {
  test("a second load comes from the cache without a request, the same data", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(registryApis);
    const first = await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    const second = await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    expect(second.meta).toEqual({ requests: 0, fromCache: true, missing: [] });
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
    expect(stub.calls).toHaveLength(3);
  });

  test("a missing entry is never cached, a found one is", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(registryApis);
    const options = { npm: ["react", "nosuchpackage-readmint"], fetch: stub.fetch, cache };
    await loadRegistryData(options);
    expect(stub.calls).toHaveLength(3);
    const second = await loadRegistryData(options);
    expect(stub.calls).toHaveLength(4);
    expect(second.meta).toEqual({
      requests: 1,
      fromCache: false,
      missing: ["npm:nosuchpackage-readmint"],
    });
  });

  test("the key covers the namespace, so another namespace fetches again", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(registryApis);
    await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    await loadRegistryData({ ...ALL, namespace: "libs", fetch: stub.fetch, cache });
    expect(stub.calls).toHaveLength(6);
  });

  test("a corrupt, foreign or invalid entry is refetched", async () => {
    const stored = new Map<string, string>();
    const cache: DataSourceCache = {
      get: (key) => Promise.resolve(stored.get(key)),
      set: (key, value) => {
        stored.set(key, value);
        return Promise.resolve();
      },
    };
    const stub = stubFetch(registryApis);
    await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    for (const key of stored.keys()) stored.set(key, '{"name":"other","version":"1"}');
    await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    expect(stub.calls).toHaveLength(6);
    for (const key of stored.keys()) stored.set(key, "{not json");
    await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    expect(stub.calls).toHaveLength(9);
    for (const key of stored.keys()) {
      stored.set(
        key,
        JSON.stringify({ name: "react", version: "x".repeat(65), weeklyDownloads: 1 }),
      );
    }
    await loadRegistryData({ npm: ["react"], fetch: stub.fetch, cache });
    expect(stub.calls).toHaveLength(11);
  });

  test("a cache that rejects is ignored", async () => {
    const cache: DataSourceCache = {
      get: () => Promise.reject(new Error("disk /secret/path")),
      set: () => Promise.reject(new Error("disk /secret/path")),
    };
    const stub = stubFetch(registryApis);
    const { data } = await loadRegistryData({ ...ALL, fetch: stub.fetch, cache });
    expect(data.npm[0]?.version).toBe("19.1.0");
  });
});
