import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DataSourceError } from "@readmint/data";
import type { FeedFetch } from "../src/index.js";

export interface StubCall {
  readonly url: string;
  readonly init: RequestInit;
}

export interface Stub {
  readonly fetch: FeedFetch;
  readonly calls: StubCall[];
}

/** Answers each request with the next response factory; the last one repeats. */
export function stubFetch(...answers: ((url: string) => Response | Promise<Response>)[]): Stub {
  const calls: StubCall[] = [];
  let index = 0;
  const fetch: FeedFetch = async (url, init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer === undefined) throw new Error("no answer");
    return answer(url);
  };
  return { fetch, calls };
}

/** The text of a file in `test/fixtures`. */
export function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

export function xml(body: BodyInit, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/rss+xml; charset=utf-8", ...headers },
  });
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
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

/** A minimal RSS document around the given items. */
export function rss(items: string): string {
  return `<rss version="2.0"><channel><title>T</title><link>https://feed.example/</link>${items}</channel></rss>`;
}
