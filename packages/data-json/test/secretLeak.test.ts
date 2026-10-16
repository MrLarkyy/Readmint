import { inspect } from "node:util";
import { MemoryCache, type DataSourceCache } from "@readmint/data";
import { describe, expect, test } from "vitest";
import { loadJsonData, type JsonFetch } from "../src/index.js";
import { failure, json, redirect, stubFetch } from "./stubFetch.js";

const SECRET = "s3cr3t-VALUE";
const SOURCE = "https://api.example/data.json";

class RecordingCache implements DataSourceCache {
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

const withHeader = (fetch: JsonFetch, cache?: DataSourceCache) =>
  loadJsonData({
    source: SOURCE,
    headers: { "X-Api-Key": "API_KEY" },
    env: { API_KEY: SECRET },
    fetch,
    timeoutMs: 1000,
    ...(cache === undefined ? {} : { cache }),
  });

function expectNoSecret(error: unknown): void {
  for (const text of [
    (error as Error).message,
    String(error),
    JSON.stringify(error),
    inspect(error, { depth: 5 }),
  ]) {
    expect(text.toLowerCase()).not.toContain(SECRET.toLowerCase());
  }
}

describe("header values never leak", () => {
  test.each<[string, JsonFetch]>([
    ["401", stubFetch(() => json("{}", {}, 401)).fetch],
    [
      "a fetch error quoting the value",
      () => Promise.reject(new TypeError(`bad header ${SECRET}`)),
    ],
    ["a timeout", () => new Promise<Response>(() => undefined)],
    ["too many redirects", stubFetch(() => redirect(`/next?k=${SECRET}`)).fetch],
    ["a redirect to http", stubFetch(() => redirect(`http://api.example/?k=${SECRET}`)).fetch],
    [
      "a bad content type",
      stubFetch(() => json("{}", { "content-type": `text/html; x=${SECRET}` })).fetch,
    ],
    [
      "a content type that is the value",
      stubFetch(() => json("{}", { "content-type": SECRET })).fetch,
    ],
    ["invalid JSON echoing the value", stubFetch(() => json(`{"key":"${SECRET}"`)).fetch],
  ])("through %s", async (_name, fetch) => {
    const error = await failure(withHeader(fetch));
    expectNoSecret(error);
  });

  test("a value with a newline is refused without echoing it", async () => {
    const error = await failure(
      loadJsonData({
        source: SOURCE,
        headers: { "x-api-key": "API_KEY" },
        env: { API_KEY: `${SECRET}\r\nx-evil: 1` },
        fetch: stubFetch(() => json("{}")).fetch,
      }),
    );
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain("API_KEY");
    expectNoSecret(error);
  });

  test("a missing variable is missing-token naming the variable and the header", async () => {
    const error = await failure(
      loadJsonData({
        source: SOURCE,
        headers: { "x-api-key": "API_KEY" },
        env: {},
        fetch: stubFetch(() => json("{}")).fetch,
      }),
    );
    expect(error.code).toBe("missing-token");
    expect(error.message).toContain("API_KEY");
    expect(error.message).toContain("x-api-key");
  });

  test.each([["Host"], ["content-length"], ["Transfer-Encoding"], ["bad header"]])(
    "header name %j is invalid-option",
    async (name) => {
      const error = await failure(
        loadJsonData({
          source: SOURCE,
          headers: { [name]: "API_KEY" },
          env: { API_KEY: SECRET },
          fetch: stubFetch(() => json("{}")).fetch,
        }),
      );
      expect(error.code).toBe("invalid-option");
    },
  );

  test("more than 8 headers are invalid-option", async () => {
    const headers = Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => [`x-h${String(index)}`, "API_KEY"]),
    );
    const error = await failure(
      loadJsonData({
        source: SOURCE,
        headers,
        env: { API_KEY: SECRET },
        fetch: stubFetch(() => json("{}")).fetch,
      }),
    );
    expect(error.code).toBe("invalid-option");
  });

  test("a load with headers never reads or writes the cache", async () => {
    const cache = new RecordingCache();
    const stub = stubFetch(() => json(`{"echo":"${SECRET}"}`));
    await withHeader(stub.fetch, cache);
    await withHeader(stub.fetch, cache);
    expect(cache.keys).toEqual([]);
    expect(cache.values).toEqual([]);
    expect(stub.calls).toHaveLength(2);
  });

  test("the value is sent only in its header", async () => {
    const stub = stubFetch(() => json("{}"));
    await withHeader(stub.fetch);
    expect(stub.calls[0]?.url).not.toContain(SECRET);
    expect(new Headers(stub.calls[0]?.init.headers).get("x-api-key")).toBe(SECRET);
  });
});
