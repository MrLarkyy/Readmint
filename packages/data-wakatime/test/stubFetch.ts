import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataSourceError } from "@readmint/data";
import type { WakaTimeFetch } from "../src/index.js";

export interface StubCall {
  readonly url: string;
  readonly init: RequestInit;
}

export interface Stub {
  readonly fetch: WakaTimeFetch;
  readonly calls: StubCall[];
}

/** A canary key: no output may hold it in any form. */
export const CANARY_KEY = "waka_CANARY0rm158-0000-4000-8000-c4n4ryk3y000";

/** Answers each request with the next response factory; the last one repeats. */
export function stubFetch(...answers: ((url: string) => Response | Promise<Response>)[]): Stub {
  const calls: StubCall[] = [];
  let index = 0;
  const fetch: WakaTimeFetch = async (url, init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer === undefined) throw new Error("no answer");
    return answer(url);
  };
  return { fetch, calls };
}

/**
 * The text of a file in `test/fixtures`. `stats-last_7_days.json` is shaped after the stats answer of the public
 * WakaTime API v1 docs (`GET /api/v1/users/current/stats/:range`): `data.total_seconds`, `human_readable_total`,
 * `daily_average`, `languages[]`/`editors[]`/`operating_systems[]` of `{ name, total_seconds, percent, ... }`,
 * `is_up_to_date`, plus fields the source must never copy (projects, machines, username).
 */
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

/** A stats answer whose `data` is `stats`. */
export function stats(data: Record<string, unknown>, status = 200): Response {
  return json(JSON.stringify({ data }), status);
}

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
