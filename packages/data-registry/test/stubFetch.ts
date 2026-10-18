import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataSourceError } from "@readmint/data";
import type { RegistryFetch } from "../src/index.js";

export interface StubCall {
  readonly url: string;
  readonly init: RequestInit;
}

export interface Stub {
  readonly fetch: RegistryFetch;
  readonly calls: StubCall[];
}

/** Answers every request with `answer(url, call number)`. */
export function stubFetch(
  answer: (url: string, call: number) => Response | Promise<Response>,
): Stub {
  const calls: StubCall[] = [];
  const fetch: RegistryFetch = async (url, init) => {
    calls.push({ url, init });
    return answer(url, calls.length - 1);
  };
  return { fetch, calls };
}

export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

export function json(
  body: BodyInit | null,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

const NPM_VERSIONS: Record<string, string> = { react: "19.1.0", "@types/node": "22.15.3" };
const NPM_DOWNLOADS: Record<string, number> = { react: 31_500_000, "@types/node": 98_000_000 };

/**
 * The public APIs as the fixtures model them: `GET registry.npmjs.org/<name>/latest` (the manifest of the latest
 * tag), `GET api.npmjs.org/downloads/point/last-week/<name>` and Maven Central's `solrsearch/select`. A name the
 * fixtures do not know is a 404 (npm) or `numFound: 0` (Maven).
 */
export function registryApis(url: string): Response {
  const target = new URL(url);
  if (target.hostname === "registry.npmjs.org") {
    const name = decodeURIComponent(target.pathname.slice(1, -"/latest".length));
    const version = NPM_VERSIONS[name];
    return version === undefined
      ? json('{"error":"not found"}', 404)
      : json(JSON.stringify({ name, version, description: "ignored" }));
  }
  if (target.hostname === "api.npmjs.org") {
    const name = decodeURIComponent(target.pathname.slice("/downloads/point/last-week/".length));
    const downloads = NPM_DOWNLOADS[name];
    return downloads === undefined
      ? json('{"error":"package not found"}', 404)
      : json(JSON.stringify({ downloads, start: "2026-10-11", end: "2026-10-17", package: name }));
  }
  const query = target.searchParams.get("q") ?? "";
  const match = /^g:"([^"]+)" AND a:"([^"]+)"$/.exec(query);
  const doc = match === null ? undefined : MAVEN[`${match[1] ?? ""}:${match[2] ?? ""}`];
  return json(
    JSON.stringify({
      responseHeader: { status: 0, QTime: 1 },
      response: {
        numFound: doc === undefined ? 0 : 1,
        start: 0,
        docs: doc === undefined ? [] : [doc],
      },
    }),
  );
}

const MAVEN: Record<string, Record<string, unknown>> = {
  "org.jetbrains.kotlin:kotlin-stdlib": {
    id: "org.jetbrains.kotlin:kotlin-stdlib",
    g: "org.jetbrains.kotlin",
    a: "kotlin-stdlib",
    latestVersion: "2.1.20",
    repositoryId: "central",
    p: "jar",
    timestamp: 1_743_000_000_000,
    versionCount: 130,
  },
  "junit:junit": {
    id: "junit:junit",
    g: "junit",
    a: "junit",
    latestVersion: "4.13.2",
    p: "jar",
    timestamp: 1_608_000_000_000,
  },
};

export async function failure(promise: Promise<unknown>): Promise<DataSourceError> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof DataSourceError)) {
    throw new Error(`expected a DataSourceError, got ${String(error)}`);
  }
  return error;
}

/** A sleep that records each wait and returns at once. */
export function fakeSleep(): {
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly waits: number[];
} {
  const waits: number[] = [];
  return {
    waits,
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  };
}
