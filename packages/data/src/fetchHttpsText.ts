import { checkHttpsUrl } from "./checkHttpsUrl.js";
import { DataSourceError, type DataSourceCommonErrorCode } from "./DataSourceError.js";
import { HttpsLimits } from "./HttpsLimits.js";
import { readBodyCapped, type ReadBodyFailure } from "./readBodyCapped.js";

export interface FetchHttpsContext {
  /** The `DataSourceError` source of every failure. */
  readonly namespace: string;
  /**
   * What the messages call the load, as in "The <label> URL", "The <label> document" and
   * "The <label> request": fixed text of the source, never a value from the request.
   */
  readonly label: string;
  /** The `accept` header of every hop. */
  readonly accept: string;
  /** Sent only while a hop stays on the origin of the first URL. */
  readonly headers: Readonly<Record<string, string>>;
  /** Why a `content-type` is refused, or `undefined` when it is taken; quoted as "answer <why>". */
  readonly checkMediaType: (value: string | null) => string | undefined;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  /** `fetch` as the loader calls it; injectable so tests answer without a network. */
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly signal: AbortSignal | null;
}

export interface FetchedText {
  readonly text: string;
  /** Requests sent, redirects included. */
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
 * GETs a UTF-8 document, following at most `maxRedirects` https redirects by hand so each target
 * is checked and headers never reach another origin. One timeout covers every hop and the body.
 * Errors are fixed text plus a status or a media type, never a URL, header or upstream message.
 */
export async function fetchHttpsText(url: URL, context: FetchHttpsContext): Promise<FetchedText> {
  const timeout = AbortSignal.timeout(context.timeoutMs);
  const signal = context.signal ? AbortSignal.any([timeout, context.signal]) : timeout;
  const fail = (code: DataSourceCommonErrorCode, message: string) =>
    new DataSourceError(context.namespace, code, message);
  const subject = `The ${context.label} URL`;
  // Called unbound: a browser's fetch throws when called as a method of another object.
  const fetch = context.fetch;
  let current = url;
  let requests = 0;
  for (;;) {
    if (signal.aborted) throw timedOut(context);
    const headers: [string, string][] = [["accept", context.accept]];
    if (current.origin === url.origin) headers.push(...Object.entries(context.headers));
    requests += 1;
    let response: Response;
    try {
      response = await untilAborted(
        fetch(current.href, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          headers,
          signal,
        }),
        signal,
      );
    } catch (error) {
      throw transportFailure(error, signal, context);
    }
    const status = response.status;
    if (response.type === "opaqueredirect" || REDIRECTS.has(status)) {
      await discard(response);
      if (requests > HttpsLimits.maxRedirects) {
        throw fail(
          "invalid-response",
          `${subject} redirected more than ${String(HttpsLimits.maxRedirects)} times.`,
        );
      }
      current = redirectTarget(response, current, subject, fail);
      continue;
    }
    if (status >= 200 && status < 300) {
      const problem = context.checkMediaType(response.headers.get("content-type"));
      if (problem !== undefined) {
        await discard(response);
        throw fail("invalid-response", `${subject} answer ${problem}.`);
      }
      const text = await readText(response, signal, context);
      return { text, requests };
    }
    await discard(response);
    throw fail(
      STATUS_CODES.get(status) ?? "invalid-response",
      `${subject} answered HTTP ${String(status)}.`,
    );
  }
}

function redirectTarget(
  response: Response,
  current: URL,
  subject: string,
  fail: (code: DataSourceCommonErrorCode, message: string) => Error,
): URL {
  // A browser hides the target of a manual redirect; Node gives it.
  const location = response.type === "opaqueredirect" ? null : response.headers.get("location");
  if (location === null || location === "") {
    throw fail("invalid-response", `${subject} redirected without a usable Location.`);
  }
  let resolved: string;
  try {
    resolved = new URL(location, current).href;
  } catch {
    throw fail("invalid-response", `${subject} redirected to an invalid URL.`);
  }
  const next = checkHttpsUrl(resolved);
  if (typeof next === "string") {
    throw fail("invalid-response", `${subject} redirected to a URL that ${next}.`);
  }
  return next;
}

async function readText(
  response: Response,
  signal: AbortSignal,
  context: FetchHttpsContext,
): Promise<string> {
  const document = `The ${context.label} document`;
  const bodyFailure = (reason: ReadBodyFailure): DataSourceError =>
    reason === "too-large"
      ? new DataSourceError(
          context.namespace,
          "too-large",
          `${document} is larger than ${String(context.maxBytes)} bytes.`,
        )
      : new DataSourceError(
          context.namespace,
          "invalid-response",
          `${document} is not valid UTF-8.`,
        );
  const reading = readBodyCapped(response, context.maxBytes, bodyFailure);
  try {
    return await untilAborted(reading, signal);
  } catch (error) {
    if (signal.aborted) await response.body?.cancel().catch(() => undefined);
    if (error instanceof DataSourceError) throw error;
    throw transportFailure(error, signal, context);
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
  context: FetchHttpsContext,
): DataSourceError {
  if (signal.aborted || isAbortError(error)) return timedOut(context);
  return new DataSourceError(
    context.namespace,
    "network",
    `The ${context.label} URL could not be reached.`,
  );
}

function timedOut(context: FetchHttpsContext): DataSourceError {
  return new DataSourceError(
    context.namespace,
    "timeout",
    `The ${context.label} request timed out or was aborted.`,
  );
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError";
}
