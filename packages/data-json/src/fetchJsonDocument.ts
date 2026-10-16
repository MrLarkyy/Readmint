import {
  DataSourceError,
  readBodyCapped,
  type DataSourceCommonErrorCode,
  type ReadBodyFailure,
} from "@readmint/data";
import { checkHttpsUrl } from "./checkHttpsUrl.js";
import { checkMediaType } from "./checkMediaType.js";
import { JsonLimits, type JsonFetch } from "./JsonSourceOptions.js";

export interface FetchJsonContext {
  readonly namespace: string;
  /** Sent only while a hop stays on the origin of the first URL. */
  readonly headers: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly fetch: JsonFetch;
  readonly signal: AbortSignal | null;
}

export interface FetchedJson {
  readonly text: string;
  readonly requests: number;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const STATUS_CODES = new Map<number, DataSourceCommonErrorCode>([
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "not-found"],
  [429, "rate-limited"],
]);

/**
 * GETs the document, following at most `maxRedirects` https redirects by hand so each target is
 * checked and headers never reach another origin. One timeout covers every hop and the body.
 * Errors are fixed text plus a status or a media type, never a URL, header or upstream message.
 */
export async function fetchJsonDocument(url: URL, context: FetchJsonContext): Promise<FetchedJson> {
  const timeout = AbortSignal.timeout(context.timeoutMs);
  const signal = context.signal ? AbortSignal.any([timeout, context.signal]) : timeout;
  const fail = (code: DataSourceCommonErrorCode, message: string) =>
    new DataSourceError(context.namespace, code, message);
  let current = url;
  let requests = 0;
  for (;;) {
    if (signal.aborted) throw timedOut(context.namespace);
    const headers: Record<string, string> = { accept: "application/json" };
    if (current.origin === url.origin) Object.assign(headers, context.headers);
    requests += 1;
    let response: Response;
    try {
      response = await untilAborted(
        context.fetch(current.href, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers,
          signal,
        }),
        signal,
      );
    } catch (error) {
      throw transportFailure(error, signal, context.namespace);
    }
    const status = response.status;
    if (response.type === "opaqueredirect" || REDIRECTS.has(status)) {
      await discard(response);
      if (requests > JsonLimits.maxRedirects) {
        throw fail(
          "invalid-response",
          `The JSON URL redirected more than ${String(JsonLimits.maxRedirects)} times.`,
        );
      }
      current = redirectTarget(response, current, fail);
      continue;
    }
    if (status >= 200 && status < 300) {
      const problem = checkMediaType(response.headers.get("content-type"));
      if (problem !== undefined) {
        await discard(response);
        throw fail("invalid-response", `The JSON URL answer ${problem}.`);
      }
      const text = await readText(response, signal, context);
      return { text, requests };
    }
    await discard(response);
    throw fail(
      STATUS_CODES.get(status) ?? "invalid-response",
      `The JSON URL answered HTTP ${String(status)}.`,
    );
  }
}

function redirectTarget(
  response: Response,
  current: URL,
  fail: (code: DataSourceCommonErrorCode, message: string) => Error,
): URL {
  // A browser hides the target of a manual redirect; Node gives it.
  const location = response.type === "opaqueredirect" ? null : response.headers.get("location");
  if (location === null || location === "") {
    throw fail("invalid-response", "The JSON URL redirected without a usable Location.");
  }
  let resolved: string;
  try {
    resolved = new URL(location, current).href;
  } catch {
    throw fail("invalid-response", "The JSON URL redirected to an invalid URL.");
  }
  const next = checkHttpsUrl(resolved);
  if (typeof next === "string") {
    throw fail("invalid-response", `The JSON URL redirected to a URL that ${next}.`);
  }
  return next;
}

async function readText(
  response: Response,
  signal: AbortSignal,
  context: FetchJsonContext,
): Promise<string> {
  const bodyFailure = (reason: ReadBodyFailure): DataSourceError =>
    reason === "too-large"
      ? new DataSourceError(
          context.namespace,
          "too-large",
          `The JSON document is larger than ${String(context.maxBytes)} bytes.`,
        )
      : new DataSourceError(
          context.namespace,
          "invalid-response",
          "The JSON document is not valid UTF-8.",
        );
  const reading = readBodyCapped(response, context.maxBytes, bodyFailure);
  try {
    return await untilAborted(reading, signal);
  } catch (error) {
    if (signal.aborted) await response.body?.cancel().catch(() => undefined);
    if (error instanceof DataSourceError) throw error;
    throw transportFailure(error, signal, context.namespace);
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

function transportFailure(error: unknown, signal: AbortSignal, namespace: string): DataSourceError {
  if (signal.aborted || isAbortError(error)) return timedOut(namespace);
  return new DataSourceError(namespace, "network", "The JSON URL could not be reached.");
}

function timedOut(namespace: string): DataSourceError {
  return new DataSourceError(namespace, "timeout", "The JSON request timed out or was aborted.");
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError";
}
