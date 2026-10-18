import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryCache, type DataSourceCache } from "@readmint/data";
import { FileCache } from "@readmint/data/node";
import { afterEach, describe, expect, test } from "vitest";
import {
  loadWakaTimeData,
  wakaTimeAuthorization,
  wakaTimeSecretForms,
  type WakaTimeFetch,
} from "../src/index.js";
import { CANARY_KEY, failure, fixture, json, stubFetch } from "./stubFetch.js";

const STATS = fixture("stats-last_7_days.json");
const FORMS = wakaTimeSecretForms(` ${CANARY_KEY} `);

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

function expectNoKey(text: string): void {
  for (const form of FORMS) expect(text).not.toContain(form);
}

class Recorder implements DataSourceCache {
  readonly keys: string[] = [];
  readonly values: string[] = [];
  private readonly inner = new MemoryCache();
  get(key: string): Promise<string | undefined> {
    this.keys.push(key);
    return this.inner.get(key);
  }
  set(key: string, value: string, ttl: number): Promise<void> {
    this.keys.push(key);
    this.values.push(value);
    return this.inner.set(key, value, ttl);
  }
}

describe("the API key", () => {
  test("has every form a host must hide: as given, trimmed, base64 and the header", () => {
    const base64 = Buffer.from(CANARY_KEY).toString("base64");
    expect(FORMS).toEqual(
      expect.arrayContaining([
        ` ${CANARY_KEY} `,
        CANARY_KEY,
        base64,
        base64.replace(/=+$/, ""),
        `Basic ${base64}`,
      ]),
    );
    expect(wakaTimeAuthorization(` ${CANARY_KEY}\n`)).toBe(`Basic ${base64}`);
  });

  test("goes only into the Authorization header of a request to the fixed URL, never a query", async () => {
    const stub = stubFetch(() => json(STATS));
    await loadWakaTimeData({ apiKey: ` ${CANARY_KEY} `, range: "last_30_days", fetch: stub.fetch });
    expect(stub.calls).toHaveLength(1);
    const [call] = stub.calls;
    expect(call?.url).toBe("https://wakatime.com/api/v1/users/current/stats/last_30_days");
    expectNoKey(call?.url ?? "");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe(wakaTimeAuthorization(CANARY_KEY));
    const names: string[] = [];
    headers.forEach((_value, name) => names.push(name));
    expect(names.sort()).toEqual(["accept", "authorization", "user-agent"]);
    expect(call?.init.credentials).toBe("omit");
    expect(call?.init.redirect).toBe("manual");
    expect(call?.init.method).toBe("GET");
  });

  test("is in no data, meta, cache key, file name or stored value", async () => {
    const directory = await mkdtemp(join(tmpdir(), "readmint-wakatime-leak-"));
    directories.push(directory);
    const recorder = new Recorder();
    const answer: WakaTimeFetch = () => Promise.resolve(json(STATS));
    for (const cache of [recorder, new FileCache({ directory })]) {
      const result = await loadWakaTimeData({ apiKey: CANARY_KEY, fetch: answer, cache });
      expectNoKey(JSON.stringify(result));
    }
    expect(recorder.keys.length).toBeGreaterThan(0);
    for (const key of recorder.keys) expectNoKey(key);
    for (const value of recorder.values) {
      expectNoKey(value);
      expect(value).not.toContain("secret-client-project");
    }
    for (const name of await readdir(directory)) {
      expectNoKey(name);
      expectNoKey(await readFile(join(directory, name), "utf8"));
    }
  });

  test("is in no error message, whatever the upstream sends back", async () => {
    const echoes: WakaTimeFetch[] = [
      (_url, init) =>
        Promise.resolve(
          json(`{"error":"${new Headers(init.headers).get("authorization") ?? ""}"}`, 401),
        ),
      () => Promise.reject(new Error(`fetch failed ${FORMS.join(" ")}`)),
      () => Promise.resolve(json(`{"data":{"total_seconds":"${CANARY_KEY}"}}`)),
      () => Promise.resolve(new Response(CANARY_KEY, { headers: { "content-type": "text/html" } })),
      () => Promise.resolve(json("{}", 429, { "retry-after": CANARY_KEY })),
    ];
    for (const fetch of echoes) {
      const error = await failure(loadWakaTimeData({ apiKey: CANARY_KEY, fetch }));
      expectNoKey(`${error.message} ${error.stack ?? ""} ${JSON.stringify(error)}`);
    }
  });

  test("an option error never quotes it", async () => {
    for (const apiKey of [`${CANARY_KEY}\r\nx-evil: 1`, `${CANARY_KEY} with space`]) {
      const stub = stubFetch(() => json(STATS));
      const error = await failure(loadWakaTimeData({ apiKey, fetch: stub.fetch }));
      expect(error.code).toBe("invalid-option");
      expectNoKey(error.message);
      expect(stub.calls).toHaveLength(0);
    }
  });
});
