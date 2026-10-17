import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { GitHubFetch } from "../src/index.js";

/** One recorded GitHub exchange; a string `body` is sent as is, anything else as JSON. */
export interface Exchange {
  readonly request: {
    readonly operation: string;
    readonly variables: Record<string, unknown>;
    /** Set for a REST GET, which is matched by its URL instead of operation and variables. */
    readonly url?: string;
  };
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export interface Replay {
  readonly fetch: GitHubFetch;
  readonly requests: RecordedRequest[];
  /** Requests that did not match the next exchange; a passing test leaves this empty. */
  readonly failures: string[];
  pending(): number;
}

export const FIXTURE_LOGIN = "readmint-fixture";

export function exchange(name: string): Exchange {
  const url = new URL(`./fixtures/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Exchange;
}

/** The profile and the three repository pages of the fixture user, at page size 2. */
export function pageExchanges(): Exchange[] {
  return ["profile", "repositories-1", "repositories-2", "repositories-3"].map(exchange);
}

/** The activity and the weekly commits of the fixture user, asked for after the pages. */
export function activityExchanges(): Exchange[] {
  return ["activity", "weeks"].map(exchange);
}

/** A complete load of the fixture user: the profile, the pages, the activity and the weeks. */
export function successExchanges(): Exchange[] {
  return [...pageExchanges(), ...activityExchanges()];
}

/** A fetch that answers requests from `exchanges` in order and records what was sent. */
export function replayFetch(exchanges: readonly Exchange[]): Replay {
  const queue = [...exchanges];
  const requests: RecordedRequest[] = [];
  const failures: string[] = [];
  const fetch: GitHubFetch = (url, init) => {
    const body = typeof init.body === "string" ? init.body : "";
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = value;
    });
    requests.push({ url, method: init.method ?? "GET", headers, body });
    const next = queue.shift();
    if (init.method === "GET") {
      if (next?.request.url === url) return Promise.resolve(toResponse(next));
      failures.push(`expected ${next?.request.url ?? "nothing"}, got GET ${url}`);
      return Promise.reject(new Error("request mismatch"));
    }
    const sent = JSON.parse(body) as { operationName?: unknown; variables?: unknown };
    if (next === undefined) {
      failures.push(`unexpected request ${String(sent.operationName)}`);
      return Promise.reject(new Error("unexpected request"));
    }
    const { operation, variables } = next.request;
    if (sent.operationName !== operation || !isDeepStrictEqual(sent.variables, variables)) {
      failures.push(`expected ${operation} ${JSON.stringify(variables)}, got ${body}`);
      return Promise.reject(new Error("request mismatch"));
    }
    return Promise.resolve(toResponse(next));
  };
  return { fetch, requests, failures, pending: () => queue.length };
}

export function toResponse(source: Exchange): Response {
  const text = typeof source.body === "string" ? source.body : JSON.stringify(source.body);
  return new Response(text, { status: source.status, headers: source.headers });
}

/** A sleep that returns at once and records the requested waits. */
export function fakeSleep(): { sleep: (milliseconds: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    sleep: (milliseconds) => {
      waits.push(milliseconds);
      return Promise.resolve();
    },
  };
}

/** The variables a recorded request sent. */
export function sentVariables(request: RecordedRequest): unknown {
  return (JSON.parse(request.body) as { variables: unknown }).variables;
}
