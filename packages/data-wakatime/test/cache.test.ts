import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryCache, type DataSourceCache } from "@readmint/data";
import { FileCache } from "@readmint/data/node";
import { afterEach, describe, expect, test } from "vitest";
import { loadWakaTimeData, type WakaTimeSourceOptions } from "../src/index.js";
import { CANARY_KEY, fixture, json, stubFetch, type Stub } from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");
const OTHER_KEY = "waka_OTHER00rm158-0000-4000-8000-0th3rk3y0000";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "readmint-wakatime-cache-"));
  directories.push(directory);
  return directory;
}

function load(stub: Stub, cache: DataSourceCache, extra: Partial<WakaTimeSourceOptions> = {}) {
  return loadWakaTimeData({ apiKey: CANARY_KEY, fetch: stub.fetch, cache, ...extra });
}

describe("cache", () => {
  test("a second load comes from a MemoryCache without a request, the same data", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(() => json(STATS));
    const first = await load(stub, cache);
    const second = await load(stub, cache);
    expect(second.meta).toEqual({ requests: 0, fromCache: true, partial: false });
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
    expect(Object.isFrozen(second.data.languages)).toBe(true);
    expect(stub.calls).toHaveLength(1);
  });

  test("a FileCache serves the second load of another process", async () => {
    const directory = await temporaryDirectory();
    const stub = stubFetch(() => json(STATS));
    const first = await load(stub, new FileCache({ directory }));
    const second = await load(stub, new FileCache({ directory }));
    expect(second.meta.fromCache).toBe(true);
    expect(second.data).toEqual(first.data);
    expect(stub.calls).toHaveLength(1);
  });

  test("another key, range or namespace misses", async () => {
    const cache = new MemoryCache();
    const stub = stubFetch(() => json(STATS));
    await load(stub, cache);
    const other = await load(stub, cache, { apiKey: OTHER_KEY });
    const range = await load(stub, cache, { range: "last_30_days" });
    const namespace = await load(stub, cache, { namespace: "coding" });
    expect([other.meta.fromCache, range.meta.fromCache, namespace.meta.fromCache]).toEqual([
      false,
      false,
      false,
    ]);
    expect(stub.calls).toHaveLength(4);
  });

  test("the stored value is the normalised data object only", async () => {
    const directory = await temporaryDirectory();
    const stub = stubFetch(() => json(STATS));
    const { data } = await load(stub, new FileCache({ directory }));
    const [file] = await readdir(directory);
    const stored = await readFile(join(directory, file ?? ""), "utf8");
    expect((JSON.parse(stored) as { value: unknown }).value).toBe(JSON.stringify(data));
    expect(stored).not.toContain("secret-client-project");
    expect(stored).not.toContain("private-user");
  });

  test.each([
    ["not JSON", "{"],
    ["another version", '{"version":1}'],
    ["a negative total", "TOTAL"],
    ["a list that is not one", "LIST"],
  ])("a corrupt entry (%s) is a miss and the stats are fetched again", async (_name, text) => {
    const directory = await temporaryDirectory();
    const stub = stubFetch(() => json(STATS));
    const { data } = await load(stub, new FileCache({ directory }));
    const [file] = await readdir(directory);
    const path = join(directory, file ?? "");
    const entry = JSON.parse(await readFile(path, "utf8")) as { value: string };
    const broken =
      text === "TOTAL"
        ? JSON.stringify({ ...data, totalSeconds: -5 })
        : text === "LIST"
          ? JSON.stringify({ ...data, editors: "VS Code" })
          : text;
    await writeFile(path, JSON.stringify({ ...entry, value: broken }));
    const again = await load(stub, new FileCache({ directory }));
    expect(again.meta.fromCache).toBe(false);
    expect(again.data).toEqual(data);
    expect(stub.calls).toHaveLength(2);
  });

  test("a cache that rejects never fails the load", async () => {
    const broken: DataSourceCache = {
      get: () => Promise.reject(new Error(`disk ${CANARY_KEY}`)),
      set: () => Promise.reject(new Error("full")),
    };
    const stub = stubFetch(() => json(STATS));
    const result = await load(stub, broken);
    expect(result.meta).toEqual({ requests: 1, fromCache: false, partial: false });
  });
});
