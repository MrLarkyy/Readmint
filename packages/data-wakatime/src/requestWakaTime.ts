import {
  DataSourceError,
  mediaTypeCheck,
  readBodyCapped,
  type DataSourceCommonErrorCode,
  type ReadBodyFailure,
} from "@readmint/data";
import type { ResolvedWakaTimeOptions } from "./resolveWakaTimeOptions.js";
import { wakaTimeAuthorization } from "./wakaTimeAuthorization.js";
import { WakaTimeLimits, type WakaTimeRange } from "./WakaTimeSourceOptions.js";

/** The only place a request goes: the stats of the key's own user. The range is one of `WAKATIME_RANGES`. */
export function wakaTimeStatsUrl(range: WakaTimeRange): string {
  return `https://wakatime.com/api/v1/users/current/stats/${range}`;
}

export interface WakaTimeAnswer {
  /** 200 or 202 (still calculating). */
  readonly status: 200 | 202;
  /** The UTF-8 body; may be `""` for a 202. */
  readonly text: string;
  /** Requests sent, the retry included. */
  readonly requests: number;
}

const SERVER_RETRY = new Set([500, 502, 503, 504]);
const checkJson = mediaTypeCheck(new Set(["application/json"]), "json", "JSON");

/**
 * GETs the stats of `range` with the key in the `Authorization` header only. No redirect is followed (a redirect is an
 * error after one request, so the key never reaches another host). One timeout covers every attempt, wait and body.
 * A 429 is waited out once when its `Retry-After` is at most 10 s; a 500, 502, 503 or 504 is retried once after 1 s.
 * Errors are fixed text plus a status, never the URL, a header or the upstream body.
 */
export async function requestWakaTime(options: ResolvedWakaTimeOptions): Promise<WakaTimeAnswer> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const fail = (code: DataSourceCommonErrorCode, message: string) =>
    sourceError(options, code, message);
  const url = wakaTimeStatsUrl(options.range);
  const headers: [string, string][] = [
    ["accept", "application/json"],
    ["authorization", wakaTimeAuthorization(options.apiKey)],
    ["user-agent", "readmint"],
  ];
  // Called unbound: a browser's fetch throws when called as a method of another object.
  const fetch = options.fetch;
  let requests = 0;
  let waited = false;
  let retried = false;
  for (;;) {
    if (signal.aborted) throw timedOut(options);
    requests += 1;
    let response: Response;
    try {
      response = await untilAborted(
        fetch(url, { method: "GET", redirect: "manual", credentials: "omit", headers, signal }),
        signal,
      );
    } catch (error) {
      throw transportFailure(error, signal, options);
    }
    const status = response.status;
    if (response.type === "opaqueredirect" || (status >= 300 && status < 400)) {
      await discard(response);
      throw fail("invalid-response", "The WakaTime API redirected; no redirect is followed.");
    }
    if (status === 200 || status === 202) {
      const text = await readJson(response, status, signal, options);
      return { status, text, requests };
    }
    await discard(response);
    if (status === 429) {
      const wait = retryAfterSeconds(response.headers.get("retry-after"));
      if (waited || wait === null || wait > WakaTimeLimits.maxRetryWaitSeconds) {
        throw fail(
          "rate-limited",
          wait === null
            ? "The WakaTime API rate limit was hit (HTTP 429); retry later."
            : `The WakaTime API rate limit was hit (HTTP 429); retry after ${String(wait)} seconds.`,
        );
      }
      waited = true;
      await pause(options, wait * 1000, signal);
      continue;
    }
    if (SERVER_RETRY.has(status) && !retried) {
      retried = true;
      await pause(options, WakaTimeLimits.serverRetryDelayMs, signal);
      continue;
    }
    throw statusFailure(status, fail);
  }
}

function statusFailure(
  status: number,
  fail: (code: DataSourceCommonErrorCode, message: string) => DataSourceError,
): DataSourceError {
  const at = `(HTTP ${String(status)})`;
  switch (status) {
    case 401:
      return fail("unauthorized", `WakaTime rejected the API key ${at}.`);
    case 402:
    case 403:
      return fail(
        "forbidden",
        `WakaTime refused the stats ${at}; the account's plan may not cover this range.`,
      );
    case 404:
      return fail("not-found", `WakaTime found no stats for this user and range ${at}.`);
    default:
      return fail("invalid-response", `The WakaTime API answered HTTP ${String(status)}.`);
  }
}

async function readJson(
  response: Response,
  status: number,
  signal: AbortSignal,
  options: ResolvedWakaTimeOptions,
): Promise<string> {
  const bodyFailure = (reason: ReadBodyFailure): DataSourceError =>
    reason === "too-large"
      ? sourceError(
          options,
          "too-large",
          `The WakaTime answer is larger than ${String(options.maxBytes)} bytes.`,
        )
      : sourceError(options, "invalid-response", "The WakaTime answer is not valid UTF-8.");
  const problem = checkJson(response.headers.get("content-type"));
  const refused = (why: string) =>
    sourceError(options, "invalid-response", `The WakaTime answer ${why}.`);
  if (problem !== undefined && status === 200) {
    await discard(response);
    throw refused(problem);
  }
  let text: string;
  try {
    text = await untilAborted(readBodyCapped(response, options.maxBytes, bodyFailure), signal);
  } catch (error) {
    if (signal.aborted) await discard(response);
    if (error instanceof DataSourceError) throw error;
    throw transportFailure(error, signal, options);
  }
  // A 202 may come without a body (or a typed one) while WakaTime calculates; any body it has is held to JSON.
  if (problem !== undefined && text.trim() !== "") throw refused(problem);
  return text;
}

/** `Retry-After` in whole seconds; the HTTP-date form and anything else is `null`. */
function retryAfterSeconds(value: string | null): number | null {
  if (value === null || !/^\s*\d{1,6}\s*$/.test(value)) return null;
  return Number(value.trim());
}

/** A wait raced against the signal, since an injected sleep may ignore it; the default sleep clears its timer. */
async function pause(
  options: ResolvedWakaTimeOptions,
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw timedOut(options);
  let listener: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    listener = () => {
      reject(timedOut(options));
    };
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    await Promise.race([options.sleep(milliseconds, signal), aborted]);
  } finally {
    if (listener !== undefined) signal.removeEventListener("abort", listener);
  }
}

/** Settles with the promise, or rejects once the signal aborts, for a fetch that ignores it. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(new DOMException("aborted", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error("fetch failed"));
      },
    );
  });
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

function transportFailure(
  error: unknown,
  signal: AbortSignal,
  options: ResolvedWakaTimeOptions,
): DataSourceError {
  if (signal.aborted || isAbortError(error)) return timedOut(options);
  return sourceError(options, "network", "The WakaTime API could not be reached.");
}

function timedOut(options: ResolvedWakaTimeOptions): DataSourceError {
  return sourceError(options, "timeout", "The WakaTime request timed out or was aborted.");
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError";
}

/** Every error of a load names its namespace and redacts the key, though no message is built from it. */
function sourceError(
  options: ResolvedWakaTimeOptions,
  code: DataSourceCommonErrorCode,
  message: string,
): DataSourceError {
  return new DataSourceError(options.namespace, code, message, { secret: options.apiKey });
}
