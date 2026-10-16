import { DataSourceError } from "@readmint/data";
import type { JsonFetch } from "../src/index.js";

export interface StubCall {
  readonly url: string;
  readonly init: RequestInit;
}

export interface Stub {
  readonly fetch: JsonFetch;
  readonly calls: StubCall[];
}

/** Answers each request with the next response factory; the last one repeats. */
export function stubFetch(...answers: ((url: string) => Response | Promise<Response>)[]): Stub {
  const calls: StubCall[] = [];
  let index = 0;
  const fetch: JsonFetch = async (url, init) => {
    calls.push({ url, init });
    const answer = answers[Math.min(index, answers.length - 1)];
    index += 1;
    if (answer === undefined) throw new Error("no answer");
    return answer(url);
  };
  return { fetch, calls };
}

export function json(body: string, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
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

/** Plain header record of a request, lower-cased. */
export function sentHeaders(call: StubCall | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(call?.init.headers).forEach((value, name) => {
    record[name] = value;
  });
  return record;
}
