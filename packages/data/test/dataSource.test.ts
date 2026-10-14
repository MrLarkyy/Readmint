import { describe, expect, test } from "vitest";
import { checkDataSource, DataSourceError, type DataSourceCache } from "../src/index.js";
import { fakeSource } from "./fakeSource.js";

class MapCache implements DataSourceCache {
  readonly entries = new Map<string, string>();
  get(key: string) {
    return Promise.resolve(this.entries.get(key));
  }
  set(key: string, value: string) {
    this.entries.set(key, value);
    return Promise.resolve();
  }
}

const valid = { interfaceVersion: 0, namespace: "fake", dataVersion: 0, load: () => undefined };

describe("checkDataSource", () => {
  test("accepts the fake source", () => {
    expect(checkDataSource(fakeSource)).toBe(fakeSource);
  });

  test.each([
    ["interfaceVersion", { ...valid, interfaceVersion: 1 }],
    ["namespace", { ...valid, namespace: "" }],
    ["namespace", { ...valid, namespace: "Git" }],
    ["namespace", { ...valid, namespace: "a-b" }],
    ["namespace", { ...valid, namespace: "null" }],
    ["namespace", { ...valid, namespace: "a".repeat(33) }],
    ["dataVersion", { ...valid, dataVersion: -1 }],
    ["dataVersion", { ...valid, dataVersion: 1.5 }],
    ["load", { ...valid, load: "nope" }],
    ["load", { interfaceVersion: 0, namespace: "fake", dataVersion: 0 }],
    ["not an object", null],
    ["interfaceVersion", Object.create(valid) as unknown],
  ])("rejects a bad %s", (member, value) => {
    expect(() => checkDataSource(value)).toThrow(new RegExp(member));
  });
});

describe("a minimal source", () => {
  test("loads a data object whose version is the data version", async () => {
    const { data, meta } = await fakeSource.load({ value: "x" });
    expect(data).toEqual({ version: fakeSource.dataVersion, value: "x" });
    expect(meta).toEqual({ requests: 1, fromCache: false });
  });

  test("serves the second load from the cache", async () => {
    const cache = new MapCache();
    const first = await fakeSource.load({ value: "x", cache });
    const second = await fakeSource.load({ value: "x", cache });
    expect(second.meta.fromCache).toBe(true);
    expect(second.data).toEqual(first.data);
  });

  test("redacts the secret of a missing-token failure", async () => {
    const error: unknown = await fakeSource
      .load({ secret: "s3cret" })
      .catch((reason: unknown) => reason);
    expect((error as DataSourceError).message).not.toContain("s3cret");
  });

  test("rejects a timeout on an aborted signal", async () => {
    const error: unknown = await fakeSource
      .load({ value: "x", signal: AbortSignal.abort() })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DataSourceError);
    expect((error as DataSourceError).code).toBe("timeout");
  });
});
